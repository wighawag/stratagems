import {logs} from 'named-logs';
import {writable, type Readable} from 'svelte/store';
import type {PublicClient} from 'viem';

const console = logs('game:chain-time', {
	decoration: 'background: #222; padding: 0.2rem; color: #bada55',
});

export type LastSync = {
	timestampMS: number;
	blockNumber: number;
	averageBlockTime: number;
};

export type SyncedTime = {
	lastSync?: LastSync;
	/** Chain time in seconds, interpolated between syncs. */
	value: number;
};

export type ChainTimeStore = Readable<SyncedTime> & {
	/** Chain time in seconds, right now, without going through the store. */
	now(): number;
};

function formatTime(timestamp: number): string {
	return `${new Date(timestamp * 1000).toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	})},${(timestamp * 1000) % 1000}`;
}

/**
 * Chain-synced wall clock.
 *
 * The game's phases are defined against block timestamps, not the browser's
 * clock, so the two have to be pinned together. This syncs once, then polls
 * until it catches a block boundary (which is the moment the offset between
 * local and chain time is known most precisely), and interpolates from there.
 *
 * Distinct from `core/clock`, which is only a UI ticker over `Date.now()`.
 */
export function createChainTime(params: {
	publicClient: PublicClient;
	minPollingInterval?: number;
}): ChainTimeStore {
	const {publicClient} = params;
	const minPollingInterval = params.minPollingInterval ?? 200;

	let syncing: Promise<LastSync | undefined> | undefined;
	let last_time = Math.floor(Date.now() / 1000);
	let last_fetch_time_ms = Date.now();
	let last_fetch_block_number: number | null = null;
	let started = false;

	let pollingInterval: ReturnType<typeof setInterval> | null = null;
	// Once we have caught a block boundary the offset is as good as it gets.
	let hasAccurateTime = false;

	let $time: SyncedTime = {value: last_time};
	const time = writable<SyncedTime>($time, start);

	function set(newTime: SyncedTime) {
		$time.lastSync = newTime.lastSync;
		$time.value = newTime.value;
		time.set($time);
	}

	function start() {
		// Off-browser (SSR / prerender) there is no chain to sync against and a
		// server render must not leave a timer behind. See ADR-0002.
		if (typeof window === 'undefined') return;

		started = true;

		const timeUpdateInterval = setInterval(() => {
			const now = Date.now();
			const timePassedMS = now - last_fetch_time_ms;
			set({value: last_time + timePassedMS / 1000, lastSync: $time.lastSync});
		}, 1000);

		void initialSync();

		return () => {
			started = false;
			hasAccurateTime = false;
			clearInterval(timeUpdateInterval);
			if (pollingInterval) {
				clearInterval(pollingInterval);
				pollingInterval = null;
			}
		};
	}

	async function initialSync() {
		let synced = $time.lastSync;
		if (!synced) {
			if (!syncing) {
				syncing = updateTimeFromProvider();
			} else {
				// a sync is already in flight; it will continue into the loop below
				return;
			}
			synced = await syncing;

			if (!started) {
				syncing = undefined;
				return;
			}

			if (synced) {
				startBlockPolling(synced);
			} else {
				console.error('Initial sync failed, retrying...');
				setTimeout(initialSync, 1000);
			}
		} else if (!hasAccurateTime) {
			startBlockPolling(synced);
		}
	}

	function startBlockPolling(lastSync: LastSync) {
		if (hasAccurateTime) return;
		if (pollingInterval) return;

		// Aim well inside one block time so we notice the boundary quickly.
		const pollInterval = Math.max(
			Math.floor((lastSync.averageBlockTime * 1000) / 100),
			minPollingInterval,
		);

		pollingInterval = setInterval(async () => {
			try {
				const before_fetch = Date.now();
				const latestBlock = await publicClient.getBlock({blockTag: 'latest'});

				if (!started) return;

				if (hasAccurateTime) {
					if (pollingInterval) {
						clearInterval(pollingInterval);
						pollingInterval = null;
					}
					return;
				}

				const latestBlockNumber = Number(latestBlock.number);
				const latestBlockTime = Number(latestBlock.timestamp);

				if (!last_fetch_block_number) {
					throw new Error(`last_fetch_block_number not set`);
				}

				// A new block means we just observed a boundary: the local time of
				// this observation is the tightest anchor we will get.
				if (latestBlockNumber > last_fetch_block_number) {
					const after_fetch = Date.now();
					const predicted_fetch_time = (before_fetch + after_fetch) / 2;

					console.log(
						`got ${latestBlockNumber} at local time: ${formatTime(predicted_fetch_time / 1000)} (block time: ${formatTime(latestBlockTime)})`,
					);

					updateTimeFromBlock(
						predicted_fetch_time,
						{blockTime: latestBlockTime, blockNumber: latestBlockNumber},
						lastSync.averageBlockTime,
					);

					hasAccurateTime = true;
					if (pollingInterval) {
						clearInterval(pollingInterval);
						pollingInterval = null;
					}
				}
			} catch (err) {
				// Polling errors are expected while the RPC is flaky; the health
				// banner is driven by the polling stores, not by this.
				console.debug('Block polling failed:', err);
			}
		}, pollInterval);
	}

	function updateTimeFromBlock(
		fetchTimeMS: number,
		block: {blockTime: number; blockNumber: number},
		averageBlockTime: number,
	): LastSync {
		last_time = block.blockTime;
		last_fetch_time_ms = fetchTimeMS;
		last_fetch_block_number = block.blockNumber;

		const nowMS = Date.now();
		const timePassedMS = nowMS - last_fetch_time_ms;
		console.log(`time is ${formatTime(last_time + timePassedMS / 1000)}`);
		const lastSync = {
			timestampMS: last_fetch_time_ms,
			blockNumber: block.blockNumber,
			averageBlockTime,
		};
		set({value: last_time + timePassedMS / 1000, lastSync});
		return lastSync;
	}

	async function updateTimeFromProvider(): Promise<LastSync | undefined> {
		const before_fetch = Date.now();
		try {
			const latestBlock = await publicClient.getBlock({blockTag: 'latest'});

			if (!started) return;

			const latestBlockTime = Number(latestBlock.timestamp);
			const latestBlockNumber = Number(latestBlock.number);
			const after_fetch = Date.now();
			const predicted_fetch_time = (before_fetch + after_fetch) / 2;

			console.debug(
				`our first block (${latestBlockNumber}) at ${formatTime(latestBlockTime)} / ${formatTime(predicted_fetch_time)}`,
			);

			// Average block time over a window, used to size the polling interval
			// and to convert a time span into a block span when fetching logs.
			const distance = 64;
			const sampleSize =
				latestBlockNumber > distance ? distance : latestBlockNumber;
			const fromBlock = latestBlockNumber - sampleSize;

			const olderBlock = await publicClient.getBlock({
				blockNumber: BigInt(fromBlock),
			});

			if (!started) return;

			const olderBlockTime = Number(olderBlock.timestamp);
			const blockCount = latestBlockNumber - fromBlock;
			const averageBlockTime =
				blockCount > 0 ? (latestBlockTime - olderBlockTime) / blockCount : 1;

			return updateTimeFromBlock(
				predicted_fetch_time,
				{blockTime: latestBlockTime, blockNumber: latestBlockNumber},
				averageBlockTime,
			);
		} catch (err) {
			console.error(`failed to fetch from block time`, err);
			return undefined;
		}
	}

	function now() {
		const nowMS = Date.now();
		const timePassedMS = nowMS - last_fetch_time_ms;
		return last_time + timePassedMS / 1000;
	}

	return {now, subscribe: time.subscribe};
}
