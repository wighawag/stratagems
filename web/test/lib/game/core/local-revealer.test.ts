import {describe, it, expect, afterEach} from 'vitest';
import {startEmbeddedNode, type EmbeddedNode} from '$lib/embedded/node';
import {createLocalRevealer} from '$lib/game/core/local-revealer';
import {localRevealerKey} from '$lib/game/lobby/seats';

/**
 * THE LOCAL REVEALER, against a real chain in this process (webevm), with the
 * cycle stubbed: what is pinned is WHEN it sends what it was handed, and that
 * it sends it from its own key. That a reveal sent by anyone opens a
 * commitment is the contract's (the base's `reveal` takes the player as an
 * argument), and the hotseat e2e plays it end to end.
 */

const CHAIN_ID = 9007199254740519;
const TARGET = '0x00000000000000000000000000000000000c0de1' as const;
const GAME = {address: TARGET, abi: []} as const;

let node: EmbeddedNode | undefined;
afterEach(async () => {
	await node?.dispose();
	node = undefined;
});

async function chainWithARevealer(cycle: {
	cycleNumber: number;
	commiting: boolean;
}) {
	const key = localRevealerKey();
	node = await startEmbeddedNode({
		chainId: CHAIN_ID,
		initialBalances: {[key.address]: 10n ** 21n},
	});
	const revealer = createLocalRevealer<bigint>({
		provider: node.provider as never,
		chain: {
			id: CHAIN_ID,
			name: 'test',
			nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
			rpcUrls: {default: {http: []}},
		},
		privateKey: key.privateKey,
		contract: GAME as never,
		readCycle: async () => cycle,
	});
	return {revealer, key, node};
}

/**
 * Let every pass in flight finish. A tick that lands during a pass only queues
 * another one (the serialised loop's rule), so awaiting it is not awaiting the
 * pass.
 */
async function settle(revealer: {tick(): Promise<void>}): Promise<void> {
	for (let i = 0; i < 5; i++) {
		await revealer.tick();
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
}

const request = (cycleNumber: number, data: `0x${string}`[]) => ({
	identity: 7n,
	cycleNumber,
	transactions: data.map((d) => ({to: TARGET, data: d, gas: 100_000n})),
});

describe('the local revealer', () => {
	it('asks for no payment', async () => {
		const {revealer} = await chainWithARevealer({
			cycleNumber: 3,
			commiting: true,
		});
		expect(await revealer.scheduler.prepare(request(3, ['0x01']))).toEqual({
			payee: '0x0000000000000000000000000000000000000000',
			value: 0n,
		});
	});

	it('holds a turn through its commit phase, and sends it from its own key once the reveal opens', async () => {
		const cycle = {cycleNumber: 3, commiting: true};
		const {revealer, key, node} = await chainWithARevealer(cycle);
		await revealer.scheduler.submit({
			...request(3, ['0x01', '0x02']),
			commitTransaction: '0xabc',
			payment: {
				payee: '0x0000000000000000000000000000000000000000',
				value: 0n,
			},
		});
		await settle(revealer);
		expect(revealer.sends()).toBe(0);
		expect(revealer.holds(7n, 3)).toBe(true);
		expect(revealer.holds(7n, 4)).toBe(false);
		expect(revealer.holds(8n, 3)).toBe(false);

		cycle.commiting = false;
		await settle(revealer);
		expect(revealer.sends()).toBe(2);
		// Still "held" once sent: the handover must not reveal it a second time.
		expect(revealer.holds(7n, 3)).toBe(true);

		const nonce = await node.provider.request({
			method: 'eth_getTransactionCount',
			params: [key.address, 'latest'],
		});
		expect(BigInt(nonce as string)).toBe(2n);

		// Nothing is sent twice.
		await settle(revealer);
		expect(revealer.sends()).toBe(2);
	});

	it('drops a turn whose cycle the chain has left behind', async () => {
		const cycle = {cycleNumber: 3, commiting: true};
		const {revealer} = await chainWithARevealer(cycle);
		await revealer.scheduler.submit({
			...request(3, ['0x01']),
			commitTransaction: '0xabc',
			payment: {
				payee: '0x0000000000000000000000000000000000000000',
				value: 0n,
			},
		});
		cycle.cycleNumber = 4;
		cycle.commiting = false;
		await settle(revealer);
		expect(revealer.sends()).toBe(0);
		cycle.cycleNumber = 3;
		await settle(revealer);
		expect(revealer.sends()).toBe(0);
	});

	it('holds nothing it was not handed, which is what a reload leaves', async () => {
		const {revealer} = await chainWithARevealer({
			cycleNumber: 3,
			commiting: false,
		});
		expect(revealer.holds(7n, 3)).toBe(false);
	});
});
