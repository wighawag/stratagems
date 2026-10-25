import {expect} from 'earl';
import {describe, it} from 'node:test'; // using node:test as hardhat v3 do not support vitest
import {network} from 'hardhat';
import {encodeAbiParameters, keccak256, zeroAddress} from 'viem';
import {
	artifacts,
	loadAndExecuteDeploymentsFromFiles,
} from '../../rocketh/environment.js';

// SELF-CONTAINED ON PURPOSE: nothing here comes from `./utils`, which is the
// reference game's test helpers. The base and this suite arrive in every game
// of the tree, whose `test/js/utils` are their own, so the suite must run on
// the base alone. `idOf`, the chunk sentinel and the clock are restated below.

/**
 * THE BASE, DRIVEN BY A GAME THAT IS NOT THE REFERENCE ONE.
 *
 * `src/commit-reveal/test/CommitRevealStubGame.sol` has another action type
 * (an order of some quantity of a kind), a cost that depends on what each
 * action is, a penalty that is not the cost, one contract instead of routes,
 * and no token. `Game.test.ts` pins the reference game on the same base; this
 * file pins what the base promises every game: the surplus of a bond comes
 * back, a missed reveal shown its chunks costs exactly the game's penalty
 * whoever settles it, one not shown them is the player's alone and costs the
 * whole bond, and nobody but the player ever receives anything.
 */

const {provider, networkHelpers} = await network.connect();

const NO_FURTHER_ACTIONS =
	'0x000000000000000000000000000000000000000000000000' as const;
const TIMED = 0;
function idOf(account: `0x${string}`): bigint {
	return BigInt(account);
}

type Order = {kind: number; quantity: bigint};
type OrderChunk = {orders: Order[]; furtherActions: `0x${string}`};

const UNIT_COST = 3n;
const PENALTY_PER_ORDER = 2n;
const ACTIONS_PER_REVEAL = 2;
const COMMIT_PHASE = 100;
const REVEAL_PHASE = 100;
const SECRET =
	'0x00000000000000000000000000000000000000000000000000000000000057b0';

/** The one encoding, over the stub's action type, written out by hand. */
function orderChain(
	orders: readonly Order[],
	secret: `0x${string}`,
): {head: `0x${string}`; chunks: OrderChunk[]} {
	const split: Order[][] = [];
	for (let i = 0; i < orders.length; i += ACTIONS_PER_REVEAL) {
		split.push(orders.slice(i, i + ACTIONS_PER_REVEAL));
	}
	if (split.length === 0) split.push([]);
	const chunks: OrderChunk[] = [];
	let next: `0x${string}` = NO_FURTHER_ACTIONS;
	for (let i = split.length - 1; i >= 0; i--) {
		chunks.unshift({orders: split[i], furtherActions: next});
		const encoded = encodeAbiParameters(
			[
				{type: 'bytes32'},
				{
					type: 'tuple[]',
					components: [
						{name: 'kind', type: 'uint8'},
						{name: 'quantity', type: 'uint64'},
					],
				},
				{type: 'bytes24'},
			],
			[secret, split[i], next],
		);
		next = keccak256(encoded).slice(0, 50) as `0x${string}`;
	}
	return {head: next, chunks};
}

/** The timed policy's arithmetic, from a start time of zero. */
const clock = {
	getCycleNumber(time: number): {cycleNumber: number} {
		return {
			cycleNumber: Math.floor(time / (COMMIT_PHASE + REVEAL_PHASE)) + 2,
		};
	},
	cycleStartTime(cycleNumber: number): number {
		return (cycleNumber - 2) * (COMMIT_PHASE + REVEAL_PHASE);
	},
	revealStartTime(cycleNumber: number): number {
		return this.cycleStartTime(cycleNumber) + COMMIT_PHASE;
	},
};

async function deployStub() {
	const env = await loadAndExecuteDeploymentsFromFiles({provider});
	const Stub = await env.deploy('CommitRevealStubGame', {
		account: env.namedAccounts.deployer,
		artifact: artifacts.CommitRevealStubGame,
		args: [
			{
				startTime: 0n,
				commitPhaseDuration: BigInt(COMMIT_PHASE),
				revealPhaseDuration: BigInt(REVEAL_PHASE),
				time: zeroAddress,
				actionsPerReveal: BigInt(ACTIONS_PER_REVEAL),
				cyclePolicy: TIMED,
			},
			UNIT_COST,
			PENALTY_PER_ORDER,
		],
	});
	return {
		env,
		Stub,
		unnamedAccounts: env.unnamedAccounts as `0x${string}`[],
	};
}

async function now(): Promise<number> {
	const block = (await provider.request({
		method: 'eth_getBlockByNumber',
		params: ['latest', false],
	})) as {timestamp: string};
	return Number(block.timestamp);
}

async function goTo(time: number) {
	await provider.request({method: 'evm_setNextBlockTimestamp', params: [time]});
	await provider.request({method: 'evm_mine'});
}

/** A stub game in a fresh commit phase, with a player and a bystander in it. */
async function setup(orders: Order[], bond: bigint) {
	const fixtures = await networkHelpers.loadFixture(deployStub);
	const {env, Stub, unnamedAccounts} = fixtures;
	const player = unnamedAccounts[0];
	const stranger = unnamedAccounts[1];
	const delegate = unnamedAccounts[2];
	const identity = idOf(player);
	const strangerIdentity = idOf(stranger);

	const {cycleNumber: current} = clock.getCycleNumber(await now());
	const cycleNumber = current + 1;
	await goTo(clock.cycleStartTime(cycleNumber));

	await env.execute(Stub, {
		account: player,
		functionName: 'deposit',
		args: [identity, 100n],
	});
	await env.execute(Stub, {
		account: stranger,
		functionName: 'deposit',
		args: [strangerIdentity, 100n],
	});

	const {head, chunks} = orderChain(orders, SECRET);
	await env.execute(Stub, {
		account: player,
		functionName: 'makeCommitment',
		args: [identity, head, bond],
	});

	const read = {
		reserve: async (id: bigint) =>
			(await env.read(Stub, {
				functionName: 'getReserve',
				args: [id],
			})) as bigint,
		commitment: async () =>
			(await env.read(Stub, {
				functionName: 'getCommitment',
				args: [identity],
			})) as {hash: `0x${string}`; cycleNumber: bigint; bond: bigint},
		total: async (kind: number) =>
			(await env.read(Stub, {functionName: 'totalOf', args: [kind]})) as bigint,
	};

	function send(
		account: `0x${string}`,
		functionName: 'reveal' | 'revealWithoutClosing' | 'acknowledgeMissedReveal',
		chunk: OrderChunk,
	) {
		return env.execute(Stub, {
			account,
			functionName,
			args: [identity, chunk.orders, SECRET, chunk.furtherActions],
		});
	}

	return {
		...fixtures,
		player,
		stranger,
		delegate,
		identity,
		strangerIdentity,
		cycleNumber,
		head,
		chunks,
		read,
		send,
		toReveal: () => goTo(clock.revealStartTime(cycleNumber)),
		toNextCycle: () => goTo(clock.cycleStartTime(cycleNumber + 1)),
	};
}

/** Three orders over two chunks, costing 3*(1+2+4) = 21. */
const ORDERS: Order[] = [
	{kind: 1, quantity: 1n},
	{kind: 2, quantity: 2n},
	{kind: 1, quantity: 4n},
];
const COST = 21n;

describe('the commit-reveal base, under a second game', function () {
	it('hashes the stub the way its client does, in the one encoding', async function () {
		const game = await setup(ORDERS, 30n);
		const onChain = await game.env.read(game.Stub, {
			functionName: 'digest',
			args: [game.chunks[0].orders, SECRET, game.chunks[0].furtherActions],
		});
		expect(onChain).toEqual(game.head);
	});

	it('charges what the resolution reports and returns the surplus with the last chunk', async function () {
		const game = await setup(ORDERS, 30n);
		expect(game.chunks.length).toEqual(2);
		await game.toReveal();

		await game.send(game.stranger, 'reveal', game.chunks[0]);
		// Mid-turn: the first chunk's cost (3 + 6) has left the bond and the
		// reserve, and the rest of the bond is still held.
		let commitment = await game.read.commitment();
		expect(commitment.bond).toEqual(30n - 9n);
		expect(commitment.hash).toEqual(game.chunks[0].furtherActions);
		expect(await game.read.reserve(game.identity)).toEqual(100n - 9n);

		await game.send(game.stranger, 'reveal', game.chunks[1]);
		commitment = await game.read.commitment();
		expect(commitment.cycleNumber).toEqual(0n);
		expect(commitment.bond).toEqual(0n);
		// 30 bonded, 21 spent, 9 of surplus back: nothing more than the turn cost.
		expect(await game.read.reserve(game.identity)).toEqual(100n - COST);
		expect(await game.read.total(1)).toEqual(5n);
		expect(await game.read.total(2)).toEqual(2n);

		// A chunk is applied once: the head has moved past it.
		await expect(
			game.send(game.player, 'reveal', game.chunks[1]),
		).toBeRejectedWith('NothingToReveal');
	});

	it('refuses a chunk costing more than the bond still holds', async function () {
		const game = await setup(ORDERS, 10n);
		await game.toReveal();
		await game.send(game.player, 'reveal', game.chunks[0]);
		await expect(
			game.send(game.player, 'reveal', game.chunks[1]),
		).toBeRejectedWith('BondTooLow');
	});

	it('cannot pass a chunk the game opened and never closed for a reveal', async function () {
		// THE PAIR'S MISUSE IS LOUD. A game that resolves between the two calls
		// and forgets the second has not moved the chain, charged the bond or
		// counted the turn, so the commitment is exactly where it was.
		const game = await setup(ORDERS, 30n);
		await game.toReveal();
		await game.send(game.player, 'revealWithoutClosing', game.chunks[0]);
		const commitment = await game.read.commitment();
		expect(commitment.hash).toEqual(game.head);
		expect(commitment.bond).toEqual(30n);
		expect(await game.read.reserve(game.identity)).toEqual(100n);
		const attendance = (await game.env.read(game.Stub, {
			functionName: 'getAttendance',
		})) as {revealed: bigint};
		expect(attendance.revealed).toEqual(0n);
	});

	it('settles a missed reveal shown its chunks, by a stranger, over more than one chunk: the exact penalty, the surplus back', async function () {
		const game = await setup(ORDERS, 30n);
		await game.toNextCycle();

		await game.send(game.stranger, 'acknowledgeMissedReveal', game.chunks[0]);
		// The penalty is the GAME's (2 per order), not the cost (3 per unit).
		let commitment = await game.read.commitment();
		expect(commitment.hash).toEqual(game.chunks[0].furtherActions);
		expect(commitment.bond).toEqual(30n - 4n);
		expect(await game.read.reserve(game.identity)).toEqual(100n - 4n);

		await game.send(game.stranger, 'acknowledgeMissedReveal', game.chunks[1]);
		commitment = await game.read.commitment();
		expect(commitment.cycleNumber).toEqual(0n);
		expect(commitment.bond).toEqual(0n);
		// Three orders, 2 each: 6 forfeited out of 30 bonded, 24 back.
		expect(await game.read.reserve(game.identity)).toEqual(100n - 6n);

		// Nothing applied, and nothing to whoever settled.
		expect(await game.read.total(1)).toEqual(0n);
		expect(await game.read.reserve(game.strangerIdentity)).toEqual(100n);
	});

	it('settles the rest of a half-revealed turn shown the remaining chunk', async function () {
		const game = await setup(ORDERS, 30n);
		await game.toReveal();
		await game.send(game.player, 'reveal', game.chunks[0]);
		await game.toNextCycle();

		await game.send(game.stranger, 'acknowledgeMissedReveal', game.chunks[1]);
		// 9 spent on the chunk that landed, 2 forfeited for the one that did not.
		expect(await game.read.reserve(game.identity)).toEqual(100n - 9n - 2n);
		expect((await game.read.commitment()).cycleNumber).toEqual(0n);
		expect(await game.read.reserve(game.strangerIdentity)).toEqual(100n);
	});

	it('refuses a settlement without the chunks to a stranger, and takes the whole bond for the player', async function () {
		const game = await setup(ORDERS, 30n);
		await game.toNextCycle();

		await expect(
			game.env.execute(game.Stub, {
				account: game.stranger,
				functionName: 'forfeitMissedReveal',
				args: [game.identity],
			}),
		).toBeRejectedWith('NotDelegate');

		await game.env.execute(game.Stub, {
			account: game.player,
			functionName: 'forfeitMissedReveal',
			args: [game.identity],
		});
		expect(await game.read.reserve(game.identity)).toEqual(100n - 30n);
		expect((await game.read.commitment()).cycleNumber).toEqual(0n);
		expect(await game.read.reserve(game.strangerIdentity)).toEqual(100n);
	});

	it('lets the player delegate settle without the chunks, and pays the delegate nothing', async function () {
		const game = await setup(ORDERS, 30n);
		await game.env.execute(game.Stub, {
			account: game.player,
			functionName: 'registerDelegate',
			args: [game.delegate, zeroAddress],
		});
		await game.toNextCycle();

		await game.env.execute(game.Stub, {
			account: game.delegate,
			functionName: 'forfeitMissedReveal',
			args: [game.identity],
		});
		expect(await game.read.reserve(game.identity)).toEqual(100n - 30n);
		expect(await game.read.reserve(idOf(game.delegate))).toEqual(0n);
	});
});
