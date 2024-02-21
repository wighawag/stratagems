import {writable} from 'svelte/store';
import {connection, devProvider} from './connection';
import {params} from '$lib/config';

let timestamp = Math.floor(Date.now() / 1000);
let lastFetchLocalTime = performance.now();

let maxRead = 0;
let synced = false;
let contract: `0x${string}` | undefined;

async function getBlockchainTime() {
	if (typeof window !== 'undefined' && devProvider) {
		if (connection.$state.provider) {
			if (contract) {
				const rawTimestamp = await devProvider.request({
					method: 'eth_call',
					params: [{data: '0xb80777ea', to: contract}],
				});
				timestamp = Number(rawTimestamp);
				try {
					await connection.$state.provider?.syncBlock(); // TODO in web3-connection
				} catch (err) {
					console.error(`syncBlock error`, err);
				}

				lastFetchLocalTime = performance.now();
				synced = true;
			} else {
				const block = await devProvider.request({
					method: 'eth_getBlockByNumber',
					params: ['latest', false],
				});
				if (block) {
					timestamp = Number(block.timestamp);
					try {
						await connection.$state.provider?.syncBlock(); // TODO in web3-connection
					} catch (err) {
						console.error(`syncBlock error`, err);
					}
					lastFetchLocalTime = performance.now();
					synced = true;
				} else {
					synced = false;
					timestamp = Math.floor(Date.now() / 1000);
					lastFetchLocalTime = performance.now();
				}
			}
		} else {
			synced = false;
			timestamp = Math.floor(Date.now() / 1000);
			lastFetchLocalTime = performance.now();
		}
	} else {
		if (connection.$state.provider) {
			if (contract) {
				const rawTimestamp = await connection.$state.provider?.request({
					method: 'eth_call',
					params: [{data: '0xb80777ea', to: contract}],
				});
				timestamp = Number(rawTimestamp);
				lastFetchLocalTime = performance.now();
			} else {
				timestamp = connection.$state.provider.currentTime();
				lastFetchLocalTime = performance.now();
			}
			try {
				await connection.$state.provider?.syncBlock(); // TODO in web3-connection
			} catch (err) {
				console.error(`syncBlock error`, err);
			}
			synced = true;
		} else {
			synced = false;
			timestamp = Math.floor(Date.now() / 1000);
			lastFetchLocalTime = performance.now();
		}
	}
	return timestamp;
}

const _every3Seconds = writable({timestamp, synced}, (set, update) => {
	let timer: NodeJS.Timeout | undefined;

	async function fetchTime() {
		const lastTimestamp = timestamp;
		const lastSynced = synced;
		if ((!params['fetch-time-once'] && (devProvider || contract)) || !synced) {
			let timeout: NodeJS.Timeout | undefined;
			try {
				timeout = setTimeout(() => {
					console.error(`getTime timed out!`);
					timeout = undefined;
					timer = setTimeout(fetchTime, 3000);
				}, 3000);
				const timestamp = await getBlockchainTime();
				if (timeout == undefined) {
					return;
				}
				clearTimeout(timeout);
				if (timestamp && !isNaN(timestamp)) {
					if (lastTimestamp != timestamp || lastSynced != synced) {
						set({timestamp, synced});
					}
				}
				if (timer) {
					timer = setTimeout(fetchTime, 3000);
				}
			} catch (err) {
				if (timeout == undefined) {
					return;
				}
				clearTimeout(timeout);
				console.error(`getTime error`, err);
				if (timer) {
					timer = setTimeout(fetchTime, 3000);
				}
			}
		} else {
			const local = performance.now();
			const delta = local - lastFetchLocalTime;

			update((v) => {
				const newT = Math.floor(v.timestamp + delta / 1000);
				v.timestamp = newT;
				return v;
			});

			timer = setTimeout(fetchTime, 3000);
		}
	}

	timer = setTimeout(fetchTime, 3000);
	return () => {
		clearTimeout(timer);
		timer = undefined;
	};
});

export const every3Seconds = {
	subscribe: _every3Seconds.subscribe,
};

const _everySeconds = writable({timestamp, synced}, (set, update) => {
	let timer: NodeJS.Timeout | undefined;

	function getTime() {
		const local = performance.now();
		const delta = local - lastFetchLocalTime;

		update((v) => {
			const newT = Math.floor(v.timestamp + delta / 1000);
			if (newT != v.timestamp || v.synced != synced) {
				v.timestamp = newT;
				v.synced = synced;
			}
			return v;
		});

		timer = setTimeout(getTime, 1000);
	}

	timer = setTimeout(getTime, 1000);
	return () => {
		clearTimeout(timer);
		timer = undefined;
	};
});

export const everySeconds = {
	subscribe: _everySeconds.subscribe,
};

export const time = {
	get now() {
		let n = performance.now();
		const v = timestamp + Math.floor((n - lastFetchLocalTime) / 1000);
		if (v < maxRead) {
			return maxRead;
		}
		if (synced) {
			maxRead = v;
		}
		return v;
	},
	setTimeKeeperContract(contractAddress: `0x${string}`) {
		contract = contractAddress;
	},
	get hasTimeContract() {
		return !!contract;
	},
};

if (typeof window !== 'undefined') {
	(window as any).every3Seconds = every3Seconds;
}
