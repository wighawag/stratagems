import {describe, it, expect, vi} from 'vitest';

/**
 * THE WORLD'S WALLET, announced by the game's own announcer when it names one
 * (K2c): a game whose world must give the same accounts every time (a demo
 * preset of infinite-gambit's, by a fixed mnemonic) announces its own way, and
 * the world's wallet still gives every seat its gas.
 */

const announced: unknown[] = [];
vi.mock('$lib/embedded/wallet', () => ({
	announceEmbeddedWallet: async (params: {accounts?: number}) => {
		announced.push({default: params});
		return wallet(params.accounts ?? 1);
	},
}));

function wallet(count: number) {
	return {
		accounts: Array.from(
			{length: count},
			(_, i) => `0x${(0xa1 + i).toString(16).padStart(40, '0')}` as const,
		),
		handle: {},
		select: () => {},
		cleanup: () => {},
	};
}

const {createOfflineWallet} = await import('$lib/game/offline');
const {tableOf} = await import('$lib/game/lobby/seats');

function provider() {
	const funded: string[] = [];
	return {
		funded,
		request: async (args: {method: string; params: [string, string]}) => {
			if (args.method === 'evm_setBalance') funded.push(args.params[0]);
			return null;
		},
	};
}

describe('createOfflineWallet', () => {
	it('announces the mechanism’s wallet by default', async () => {
		announced.length = 0;
		const node = provider();
		const offline = createOfflineWallet();
		await offline.announce({
			provider: node as never,
			chainId: 7,
			table: tableOf(3),
			gas: 1n,
		});
		expect(announced).toEqual([
			{default: {provider: node, chainId: 7, accounts: 1}},
		]);
	});

	it('announces through the game’s own announcer, and still gives every seat its gas', async () => {
		announced.length = 0;
		const node = provider();
		const own: unknown[] = [];
		const offline = createOfflineWallet({
			announce: async (params) => {
				own.push(params);
				return wallet(params.accounts ?? 1) as never;
			},
		});
		const table = tableOf(3);
		const answered = await offline.announce({
			provider: node as never,
			chainId: 7,
			table,
			gas: 1n,
		});
		expect(announced).toEqual([]);
		expect(own).toEqual([{provider: node, chainId: 7, accounts: 1}]);
		expect(offline.current()).toBe(answered);
		const world = table.flatMap((seat) =>
			seat.occupant.kind === 'the-world' ? [seat.occupant.address] : [],
		);
		expect(node.funded).toEqual([...answered.accounts, ...world]);
	});
});
