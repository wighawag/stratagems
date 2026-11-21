import {describe, it, expect, vi, beforeEach} from 'vitest';

/**
 * THE ONE PERSON AT THIS DEVICE, SEATED (K2b): the world connects its own
 * wallet, signs in when the app does, and authorises this browser's key
 * itself, none of it fatal to a booted world. The hotseat half (each person
 * signed in and authorised in turn) switches a real connection's account and
 * is pinned in a browser by `offline-hotseat.e2e.ts`.
 */

const authorised: unknown[] = [];
let outcome: Promise<{step: string}> = Promise.resolve({step: 'Authorised'});
vi.mock('$lib/ui/delegation/authorise-here', () => ({
	authoriseTheBrowsersKey: (context: unknown) => {
		authorised.push(context);
		return outcome;
	},
}));

// What the hotseat's revealer and its handover's reader are built on: the
// game's contract, read off the records by its deployment name.
const revealers: {contract: unknown}[] = [];
vi.mock('$lib/game/core/local-revealer', () => ({
	createLocalRevealer: (params: {contract: unknown}) => {
		revealers.push(params);
		return {scheduler: {}, start: () => () => {}, holds: () => false};
	},
}));
const readers: {contract: unknown}[] = [];
vi.mock('$lib/game/lobby/hotseat', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/game/lobby/hotseat')>()),
	createHotseatChainReader: (params: {contract: unknown}) => {
		readers.push(params);
		return async () => ({});
	},
	createHotseat: () => ({start: () => () => {}}),
}));

const {seatTheHumans, revealerForTheHumans, handOverBetweenThem} =
	await import('$lib/game/offline');

function connection(params: {
	target: 'SignedIn' | 'WalletConnected';
	fails?: boolean;
}) {
	const calls: string[] = [];
	return {
		calls,
		connection: {
			targetStep: params.target,
			ensureConnected: async (step: string) => {
				calls.push(`ensureConnected ${step}`);
				if (params.fails) throw new Error('no wallet');
			},
			requestSignature: async () => {
				calls.push('requestSignature');
			},
		},
	};
}

beforeEach(() => {
	authorised.length = 0;
	revealers.length = 0;
	readers.length = 0;
	outcome = Promise.resolve({step: 'Authorised'});
});

describe('seatTheHumans, one person here', () => {
	it('connects, signs in, then authorises this browser’s key, and seats nobody for a handover', async () => {
		const {calls, connection: c} = connection({target: 'SignedIn'});
		const context = {connection: c};
		const steps: string[] = [];
		const seated = await seatTheHumans({
			context: context as never,
			wallet: undefined,
			humans: [{seat: 0, account: 0}],
			identityOf: async () => 1n,
			onStep: (what) => steps.push(what),
		});
		expect(calls).toEqual([
			'ensureConnected WalletConnected',
			'requestSignature',
		]);
		expect(authorised).toEqual([context]);
		expect(seated).toEqual([]);
		expect(steps).toEqual(['connecting', "authorising this browser's key"]);
	});

	it('still authorises after a connect that failed, and survives a refusal', async () => {
		const {connection: c} = connection({target: 'SignedIn', fails: true});
		outcome = Promise.reject(new Error('refused'));
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			seatTheHumans({
				context: {connection: c} as never,
				wallet: undefined,
				humans: [{seat: 0, account: 0}],
				identityOf: async () => 1n,
			}),
		).resolves.toEqual([]);
		expect(authorised).toHaveLength(1);
		expect(errors).toHaveBeenCalledTimes(2);
		errors.mockRestore();
	});
});

describe('seatTheHumans, the game’s own step once a key is authorised', () => {
	it('runs it after the authorisation, while the person is signed in', async () => {
		const {calls, connection: c} = connection({target: 'SignedIn'});
		await seatTheHumans({
			context: {connection: c} as never,
			wallet: undefined,
			humans: [{seat: 0, account: 0}],
			identityOf: async () => 1n,
			afterAuthorising: async () => {
				calls.push(`afterAuthorising, ${authorised.length} authorised`);
			},
		});
		expect(calls).toEqual([
			'ensureConnected WalletConnected',
			'requestSignature',
			'afterAuthorising, 1 authorised',
		]);
	});

	it('is not fatal when it fails', async () => {
		const {connection: c} = connection({target: 'SignedIn'});
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			seatTheHumans({
				context: {connection: c} as never,
				wallet: undefined,
				humans: [{seat: 0, account: 0}],
				identityOf: async () => 1n,
				afterAuthorising: async () => {
					throw new Error('no gas');
				},
			}),
		).resolves.toEqual([]);
		expect(errors).toHaveBeenCalledTimes(1);
		errors.mockRestore();
	});
});

describe('the hotseat’s revealer and handover, on the game’s contract', () => {
	const GAME = {address: '0x00000000000000000000000000000000000000C1', abi: []};
	const OTHER = {
		address: '0x00000000000000000000000000000000000000C2',
		abi: [],
	};
	const records = {
		get: () => ({
			chain: {
				id: 1,
				name: 'Offline',
				nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
			},
			contracts: {Game: GAME, Stratagems: OTHER},
		}),
	};
	const world = {provider: {}, deployments: records};
	const humans = [
		{seat: 0, account: 0},
		{seat: 1, account: 1},
	];
	const seated = [
		{address: GAME.address as `0x${string}`, player: 1n, label: 'Player 1'},
		{address: OTHER.address as `0x${string}`, player: 2n, label: 'Player 2'},
	];
	const context = {
		connection: {},
		game: {submission: {}},
		accountData: {},
	};

	it('reads the `Game` when no contract is named', () => {
		const revealer = revealerForTheHumans({
			world: world as never,
			records: records as never,
			humans,
			onActed: () => {},
		});
		handOverBetweenThem({
			seated,
			wallet: {select: () => {}} as never,
			revealer,
			context: context as never,
			world: world as never,
			records: records as never,
		});
		expect(revealers.map((r) => r.contract)).toEqual([GAME]);
		expect(readers.map((r) => r.contract)).toEqual([GAME]);
	});

	it('reads the contract a game names, for a game whose contract is not the `Game`', () => {
		const revealer = revealerForTheHumans({
			world: world as never,
			records: records as never,
			humans,
			onActed: () => {},
			contract: 'Stratagems',
		});
		handOverBetweenThem({
			seated,
			wallet: {select: () => {}} as never,
			revealer,
			context: context as never,
			world: world as never,
			records: records as never,
			contract: 'Stratagems',
		});
		expect(revealers.map((r) => r.contract)).toEqual([OTHER]);
		expect(readers.map((r) => r.contract)).toEqual([OTHER]);
	});
});
