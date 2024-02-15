import {writable} from 'svelte/store';
import {connection, devProvider} from './connection';

let timestamp = Math.floor(Date.now() / 1000);
let lastFetchLocalTime = performance.now();

let maxRead = 0;
let synced = false;
let contract: `0x${string}` | undefined;

async function getTime() {
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

const _time = writable({timestamp, synced}, (set) => {
	let timer: NodeJS.Timeout | undefined;

	async function fetchTime() {
		const lastTimestamp = timestamp;
		const lastSynced = synced;
		let timeout: NodeJS.Timeout | undefined;
		try {
			timeout = setTimeout(() => {
				console.error(`getTime timed out!`);
				timeout = undefined;
				timer = setTimeout(fetchTime, 3000);
			}, 3000);
			const timestamp = await getTime();
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
	}

	timer = setTimeout(fetchTime, 3000);
	return () => {
		clearTimeout(timer);
		timer = undefined;
	};
});

export const time = {
	subscribe: _time.subscribe,
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
	(window as any).time = time;
}
