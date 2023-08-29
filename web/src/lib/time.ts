import {derived, writable} from 'svelte/store';
import {connection, devProvider} from './web3';

let timestamp = Math.floor(Date.now() / 1000);
let synced = false;
let contract: `0x${string}` | undefined;
const _time = writable({timestamp, synced}, (set) => {
	let timeout: NodeJS.Timeout | undefined;

	async function getTime() {
		const lastTimestamp = timestamp;
		const lastSynced = synced;
		try {
			if (typeof window !== 'undefined' && devProvider) {
				if (connection.$state.provider) {
					if (contract) {
						const rawTimestamp = await devProvider.request({
							method: 'eth_call',
							params: [{data: '0xb80777ea', to: contract}],
						});
						const parsedTimestamp = parseInt(rawTimestamp.slice(2), 16);
						timestamp = await connection.$state.provider?.syncTime(parsedTimestamp);
					} else {
						const block = await devProvider.request({
							method: 'eth_getBlockByNumber',
							params: ['latest', false],
						});
						timestamp = await connection.$state.provider?.syncTime(block);
					}
					synced = true;
				} else {
					synced = false;
					timestamp = Math.floor(Date.now() / 1000);
				}
			} else {
				if (connection.$state.provider) {
					if (contract) {
						const rawTimestamp = await connection.$state.provider?.request({
							method: 'eth_call',
							params: [{data: '0xb80777ea', to: contract}],
						});
						timestamp = parseInt(rawTimestamp.slice(2), 16);
					} else {
						timestamp = connection.$state.provider.currentTime();
					}
					synced = true;
				} else {
					synced = false;
					timestamp = Math.floor(Date.now() / 1000);
				}
			}

			if (timestamp && !isNaN(timestamp)) {
				if (lastTimestamp != timestamp || lastSynced != synced) {
					set({timestamp, synced});
				}
			}
		} finally {
			if (timeout) {
				timeout = setTimeout(getTime, 3000);
			}
		}
	}
	timeout = setTimeout(getTime, 3000);
	return () => {
		clearTimeout(timeout);
		timeout = undefined;
	};
});

export const time = {
	subscribe: _time.subscribe,
	get now() {
		return timestamp;
	},
	setTimeKeeperContract(contractAddress: `0x${string}`) {
		contract = contractAddress;
	},
};

if (typeof window !== 'undefined') {
	(window as any).time = time;
}
