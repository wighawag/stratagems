import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest';
import {writable} from 'svelte/store';
import {createPublicClient, custom} from 'viem';
import {createPollingOnchainState} from '$lib/onchain/state';
import type {ChainTimeStore, SyncedTime} from '$lib/game/core/chain-time';
import type {CycleInfo, CycleInfoStore} from '$lib/game/core/cycle';
import type {Camera, CameraWatcher} from '$lib/game/render/camera';
import type {TypedPublicClient} from '$lib/core/connection/types';

/**
 * EVERY FETCH READS THE BLOCK THE CHAIN IS AT, not one viem remembered.
 *
 * viem caches `getBlockNumber` for the client's `cacheTime`, which defaults to
 * its `pollingInterval`: FOUR SECONDS. The poller hands that number to the
 * reader as `toBlock`, the reader pins its entity read to it and ends its log
 * range at it, so a stale number is a stale board, and on a chain where a cycle
 * takes less than four seconds it is a board with no turns in it at all.
 *
 * That is what the offline world is. Measured in bomber-world (2026-09-27),
 * 14 cycles against the chain in the tab: `toBlock` stood still for four
 * seconds at a time while the cycles went by under it, the reveal logs for
 * those cycles were outside the range, and 40 of 42 moves were drawn as a
 * jump instead of a walk (bombs, read off the same logs, popped in the same
 * way). With the cache off it was 42 walks and no jump, on two runs.
 *
 * A REAL VIEM CLIENT, deliberately. Every other poller test stubs
 * `getBlockNumber` with a function, and a stub has no cache: that is exactly
 * why none of them could see this.
 */

function timed(currentCycleNumber: number): CycleInfo {
	return {
		type: 'timed',
		currentCycleNumber,
		isCommitPhase: true,
		timeLeftInCycle: 10,
		timeInCurrentCycle: 0,
		timeLeftInPhase: 10,
		timeLeftForCommitEnd: 10,
		timeLeftForRevealEnd: 10,
		currentPhaseDuration: 20,
		revealOpensAt: 10,
		config: {
			commitPhaseDuration: 10,
			revealPhaseDuration: 10,
			startTime: 0,
			commitTimeAllowance: 1,
			policy: 'timed',
		},
	};
}

describe('createPollingOnchainState: the block a fetch reads at', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// The polling store refuses to run off-browser (ADR-0002).
		vi.stubGlobal('window', {});
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('is the latest block, even when the previous fetch was moments ago', async () => {
		let head = 100;
		const publicClient = createPublicClient({
			transport: custom({
				async request({method}: {method: string}) {
					if (method === 'eth_blockNumber') return `0x${head.toString(16)}`;
					throw new Error(`unexpected ${method}`);
				},
			}),
		}) as unknown as TypedPublicClient;

		const cycle = writable<CycleInfo>(timed(7));
		const cycleInfo: CycleInfoStore = {
			subscribe: cycle.subscribe,
			now: () => timed(7),
			fromTime: () => timed(7),
		};
		const camera: CameraWatcher = writable<Camera>({
			x: 0,
			y: 0,
			width: 10,
			height: 10,
		});
		const time = writable<SyncedTime>({
			value: 0,
			lastSync: {timestampMS: 0, blockNumber: 100, averageBlockTime: 1},
		});
		const chainTime: ChainTimeStore = {subscribe: time.subscribe, now: () => 0};

		const read = vi.fn(
			async ({expectedCycleNumber}: {expectedCycleNumber: number}) => ({
				cells: new Map(),
				cycleNumber: expectedCycleNumber,
			}),
		);

		const store = createPollingOnchainState<{cells: Map<bigint, unknown>}>({
			publicClient,
			cycleDuration: 20,
			camera,
			cycleInfo,
			chainTime,
			zonesForCamera: () => [0n],
			read,
			emptyState: () => ({cells: new Map()}),
			config: {fetchInterval: 60_000},
		});

		const off = store.subscribe(() => {});
		await vi.waitFor(() => expect(read).toHaveBeenCalled());
		expect(read.mock.calls[0][0]).toMatchObject({toBlock: 100});

		// The chain moves on, and the next cycle starts well inside viem's
		// four-second cache: an offline cycle is under a second.
		head = 105;
		read.mockClear();
		await vi.advanceTimersByTimeAsync(500);
		cycle.set(timed(8));
		await vi.waitFor(() => expect(read).toHaveBeenCalled());

		expect(read.mock.calls[0][0]).toMatchObject({
			expectedCycleNumber: 8,
			toBlock: 105,
		});
		off();
	});
});
