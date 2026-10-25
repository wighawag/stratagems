/**
 * THE FIRST COMMIT-REVEAL RULE, ASSERTED ON THE CONTRACT: the state after one
 * cycle's reveals must not depend on the order they arrive in (AGENTS.md,
 * "Commit-reveal rules"). Measured in `common/`'s model first (2026-10-24, the
 * plan's "The port proper"), which had no tokens; this measures the Solidity,
 * payouts included.
 *
 * Every order of one cycle's calls is sent in ONE block, in that order (same
 * sender, consecutive nonces), so every order runs at the same timestamp and
 * the rewards the generator accrues are comparable as well as its points.
 * Reveals that land in different blocks also differ in WHEN points are held,
 * which is time and not order, and is not what this asserts.
 *
 * Compared after each order: every cell of the board and its ring (all fields,
 * owner included), every player's wallet and reserve, the game's and the burn
 * address's balances, every account's generator points and rewards, and whether
 * each call reverted.
 *
 * `REPLAY_TRIALS` (default 25) and `REPLAY_SEED` (default 1) size the
 * randomized replay; the step's measurement ran it with REPLAY_TRIALS=10000.
 */
import {expect, describe, it} from 'vitest';
import {encodeAbiParameters, keccak256, parseEther, zeroAddress} from 'viem';
import {Color, xyToBigIntID, zeroBytes24} from 'stratagems-common';
import {getConnection, hardhatProvider, loadFixture} from '../utils/connection.js';
import {deployStratagemsWithTestConfig} from './utils/stratagems-test.js';

type Env = Awaited<ReturnType<typeof deployStratagemsWithTestConfig>>;
type Move = {position: bigint; color: Color};
type Call = {kind: 'reveal'; player: number} | {kind: 'poke'; position: bigint};

const BURN = '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead';
const BOARD = 3; // moves land on a BOARD x BOARD square
const MAX_PLAYERS = 4;

function rng(seed: number) {
	let a = seed >>> 0;
	const next = () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return {next, int: (n: number) => Math.floor(next() * n)};
}

function permutations<T>(items: T[]): T[][] {
	if (items.length <= 1) return [items];
	return items.flatMap((item, i) =>
		permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
	);
}

/** Whether the deployed game is alpha1's (its own reserve and `useReserve`) or the rebuild on the base. */
function isAlpha1(env: Env): boolean {
	return (env.Stratagems.abi as readonly {name?: string}[]).some((item) => item.name === 'getTokensInReserve');
}

function hashOf(env: Env, moves: Move[], secret: `0x${string}`): `0x${string}` {
	const movesType = {
		type: 'tuple[]',
		components: [
			{name: 'position', type: 'uint64'},
			{name: 'color', type: 'uint8'},
		],
	} as const;
	const encoded = isAlpha1(env)
		? encodeAbiParameters([{type: 'bytes32'}, movesType], [secret, moves])
		: encodeAbiParameters([{type: 'bytes32'}, movesType, {type: 'bytes24'}], [secret, moves, zeroBytes24]);
	return keccak256(encoded).slice(0, 50) as `0x${string}`;
}

type Plan = {moves: Move[]; secret: `0x${string}`};

async function setupPlayers(env: Env) {
	for (const player of env.otherAccounts.slice(0, MAX_PLAYERS)) {
		await env.TestTokens.write.transfer([player, parseEther('100')], {account: env.tokensBeneficiary});
		await env.TestTokens.write.approve([env.Stratagems.address, parseEther('100')], {account: player});
	}
}

async function deployWithPlayers() {
	const env = await deployStratagemsWithTestConfig();
	await setupPlayers(env);
	return env;
}

async function commit(env: Env, playerIndex: number, plan: Plan) {
	const player = env.otherAccounts[playerIndex];
	const hash = hashOf(env, plan.moves, plan.secret);
	const amount = parseEther(`${Math.max(plan.moves.length, 1)}`);
	const S = env.Stratagems as any;
	if (isAlpha1(env)) {
		const permit = {deadline: 0n, value: 0n, v: 0, r: `0x${'00'.repeat(32)}`, s: `0x${'00'.repeat(32)}`};
		await S.write.makeCommitmentWithExtraReserve([hash, amount, permit, zeroAddress], {account: player});
	} else {
		// the bond covers every move, so no order can make a reveal fail for lack of it
		await S.write.makeCommitmentWithExtraReserve([BigInt(player), hash, amount, amount, zeroAddress], {
			account: player,
		});
	}
}

function revealArgs(env: Env, playerIndex: number, plan: Plan) {
	const player = env.otherAccounts[playerIndex];
	return isAlpha1(env)
		? {functionName: 'reveal', args: [player, plan.secret, plan.moves, zeroBytes24, true, zeroAddress]}
		: {functionName: 'reveal', args: [BigInt(player), plan.moves, plan.secret, zeroBytes24, zeroAddress]};
}

async function toRevealPhase(env: Env) {
	await env.Time.write.increaseTime([env.config.commitPhaseDuration], {account: env.stratagemsAdmin});
}
async function toNextCommitPhase(env: Env) {
	await env.Time.write.increaseTime([env.config.revealPhaseDuration], {account: env.stratagemsAdmin});
}
/** From the start of a commit phase to the start of the commit phase `n` cycles later. */
async function skipCycles(env: Env, n: number) {
	if (n === 0) return;
	await env.Time.write.increaseTime([BigInt(n) * (env.config.commitPhaseDuration + env.config.revealPhaseDuration)], {
		account: env.stratagemsAdmin,
	});
}

/** One whole cycle, its reveals in the order given (each its own block). */
async function playCycle(env: Env, plans: {[player: number]: Plan}, order?: number[]) {
	const players = order ?? Object.keys(plans).map(Number);
	for (const p of players) await commit(env, p, plans[p]);
	await toRevealPhase(env);
	const S = env.Stratagems as any;
	for (const p of players) {
		const {functionName, args} = revealArgs(env, p, plans[p]);
		await S.write[functionName](args, {account: env.stratagemsAdmin});
	}
	await toNextCommitPhase(env);
}

/** Send `calls` in that order, all in one block, and say which reverted. */
async function sendInOneBlock(env: Env, plans: {[player: number]: Plan}, calls: Call[]): Promise<boolean[]> {
	const {publicClient, walletClient} = await getConnection();
	const provider = hardhatProvider as any;
	await provider.request({method: 'evm_setAutomine', params: [false]});
	const hashes: `0x${string}`[] = [];
	try {
		let nonce = await publicClient.getTransactionCount({address: env.stratagemsAdmin, blockTag: 'pending'});
		for (const call of calls) {
			const {functionName, args} =
				call.kind === 'reveal'
					? revealArgs(env, call.player, plans[call.player])
					: {functionName: 'poke', args: [call.position]};
			hashes.push(
				await walletClient.writeContract({
					address: env.Stratagems.address,
					abi: env.Stratagems.abi as any,
					functionName: functionName as any,
					args: args as any,
					account: env.stratagemsAdmin,
					chain: walletClient.chain,
					gas: 4_000_000n,
					nonce: nonce++,
				}),
			);
		}
		await provider.request({method: 'evm_mine', params: []});
	} finally {
		await provider.request({method: 'evm_setAutomine', params: [true]});
	}
	const receipts = await Promise.all(hashes.map((hash) => publicClient.getTransactionReceipt({hash})));
	const blocks = new Set(receipts.map((r) => r.blockNumber));
	expect(blocks.size, 'every call of one order in one block').to.equal(1);
	// the receipts in the order the calls were given: the reverts are part of the state
	return receipts.map((r) => r.status !== 'success');
}

function canonical(value: unknown): unknown {
	if (typeof value === 'bigint') return `${value}n`;
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.keys(value)
				.sort()
				.map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
		);
	}
	return value;
}

/** Everything a cycle's resolution can change, keyed so that two orders compare as JSON. */
async function readState(env: Env, reverted: boolean[]) {
	const ids: bigint[] = [];
	for (let y = -1; y <= BOARD; y++) for (let x = -1; x <= BOARD; x++) ids.push(xyToBigIntID(x, y));
	const S = env.Stratagems as any;
	const cells = await S.read.getCells([ids]);
	const accounts = [...env.otherAccounts.slice(0, MAX_PLAYERS), env.Stratagems.address, BURN, '0xffffffffffffffffffffffffffffffffffffffff'];
	const balances = await Promise.all(accounts.map((a) => env.TestTokens.read.balanceOf([a as `0x${string}`])));
	const reserves = await Promise.all(
		env.otherAccounts
			.slice(0, MAX_PLAYERS)
			.map((a) => (isAlpha1(env) ? S.read.getTokensInReserve([a]) : S.read.getReserve([BigInt(a)]))),
	);
	const points = await Promise.all(accounts.map((a) => env.GemsGenerator.read.balanceOf([a as `0x${string}`])));
	const rewards = await Promise.all(
		accounts.map((a) => (env.GemsGenerator as any).read.earnedFromPoolRate([a as `0x${string}`])),
	);
	return JSON.stringify(canonical({cells, balances, reserves, points, rewards, reverted}));
}

/** The state after each of `orders`, from the same starting chain. */
async function replay(env: Env, plans: {[player: number]: Plan}, orders: Call[][]): Promise<string[]> {
	const provider = hardhatProvider as any;
	const results: string[] = [];
	for (const order of orders) {
		const snapshot = await provider.request({method: 'evm_snapshot', params: []});
		const reverted = await sendInOneBlock(env, plans, order);
		// read in the original call order, so that the same call's revert lines up
		const byCall = order.map((call, i) => ({key: JSON.stringify(canonical(call)), reverted: reverted[i]}));
		byCall.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
		results.push(await readState(env, byCall.map((c) => c.reverted)));
		await provider.request({method: 'evm_revert', params: [snapshot]});
	}
	return results;
}

function randomPlan(r: ReturnType<typeof rng>, maxMoves: number, minMoves = 0): Plan {
	const n = minMoves + r.int(maxMoves - minMoves + 1);
	const moves: Move[] = [];
	for (let i = 0; i < n; i++) {
		// None (a removal) and the five colours; Evil, which only a collision should make, now and then
		const roll = r.int(20);
		const color = roll === 0 ? Color.Evil : roll < 4 ? Color.None : ((1 + r.int(5)) as Color);
		moves.push({position: xyToBigIntID(r.int(BOARD), r.int(BOARD)), color});
	}
	const secret = `0x${Array.from({length: 32}, () => r.int(256).toString(16).padStart(2, '0')).join('')}` as const;
	return {moves, secret};
}

const secretOf = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as `0x${string}`;
const plan = (n: number, ...moves: [number, number, Color][]): Plan => ({
	moves: moves.map(([x, y, color]) => ({position: xyToBigIntID(x, y), color})),
	secret: secretOf(n),
});

async function expectOrderIndependent(env: Env, plans: {[player: number]: Plan}, extra: Call[] = []) {
	const calls: Call[] = [...Object.keys(plans).map((p) => ({kind: 'reveal' as const, player: Number(p)})), ...extra];
	for (const p of Object.keys(plans)) await commit(env, Number(p), plans[Number(p)]);
	await toRevealPhase(env);
	const states = await replay(env, plans, permutations(calls));
	for (const state of states.slice(1)) {
		expect(diffPaths(JSON.parse(states[0]), JSON.parse(state)), 'what the order changed').to.deep.equal([]);
	}
	const state = JSON.parse(states[0]);
	// a call reverted in one order reverts in all, so a revert can hide a case: none may
	expect(state.reverted, 'no call of a hand case reverts').to.deep.equal(calls.map(() => false));
	return state;
}

/** The paths at which two states differ, for the failure message. */
function diffPaths(a: unknown, b: unknown, path = ''): string[] {
	if (JSON.stringify(a) === JSON.stringify(b)) return [];
	if (a && b && typeof a === 'object' && typeof b === 'object') {
		const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
		return [...keys].flatMap((k) => diffPaths((a as any)[k], (b as any)[k], `${path}.${k}`));
	}
	return [`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
}

const cellAt = (state: any, x: number, y: number) => state.cells[(y + 1) * (BOARD + 2) + (x + 1)];

describe('Stratagems: the order of reveals never matters', function () {
	it('two placements on one empty cell collide into an Evil cell, in both orders', async function () {
		const env = await loadFixture(deployWithPlayers);
		const state = await expectOrderIndependent(env, {0: plan(1, [1, 1, Color.Blue]), 1: plan(2, [1, 1, Color.Red])});
		expect(cellAt(state, 1, 1).color).to.equal(Color.Evil);
		expect(cellAt(state, 1, 1).stake).to.equal(2);
	});

	it("a placement on another player's live cell is skipped, in both orders", async function () {
		const env = await loadFixture(deployWithPlayers);
		await playCycle(env, {0: plan(1, [1, 1, Color.Blue])});
		// player 0 re-places their own live cell while player 1 tries to take it
		const state = await expectOrderIndependent(env, {0: plan(2, [1, 1, Color.Green]), 1: plan(3, [1, 1, Color.Red])});
		expect(cellAt(state, 1, 1).color).to.equal(Color.Green);
		expect(cellAt(state, 1, 1).owner.toLowerCase()).to.equal(env.otherAccounts[0].toLowerCase());
	});

	it('an owner removing their full-life cell while another places on it', async function () {
		const env = await loadFixture(deployWithPlayers);
		await playCycle(env, {0: plan(1, [1, 1, Color.Blue])});
		await skipCycles(env, 6); // alone, its life grows to the maximum
		const state = await expectOrderIndependent(env, {0: plan(2, [1, 1, Color.None]), 1: plan(3, [1, 1, Color.Red])});
		expect(cellAt(state, 1, 1).color).to.equal(Color.None);
	});

	it("a dying cell's share, with its neighbour's owner changing in the same cycle", async function () {
		const env = await loadFixture(deployWithPlayers);
		// player 0's Blue at (1,1) is surrounded by player 1's Reds and dies; (2,1) dies first and is free
		await playCycle(env, {0: plan(1, [1, 1, Color.Blue]), 1: plan(2, [0, 1, Color.Red], [1, 0, Color.Red], [1, 2, Color.Red])});
		await playCycle(env, {2: plan(3, [2, 1, Color.Green], [3, 1, Color.Red])});
		await skipCycles(env, 5);
		// player 3 takes the dead (2,1) while player 1 re-places a neighbour of the dead (1,1)
		await expectOrderIndependent(env, {3: plan(4, [2, 1, Color.Yellow]), 1: plan(5, [0, 1, Color.Purple])}, [
			{kind: 'poke', position: xyToBigIntID(1, 1)},
		]);
	});

	it('a poke before and after a reveal', async function () {
		const env = await loadFixture(deployWithPlayers);
		await playCycle(env, {0: plan(1, [1, 1, Color.Blue]), 1: plan(2, [0, 1, Color.Red], [2, 1, Color.Red])});
		await skipCycles(env, 4);
		await expectOrderIndependent(env, {2: plan(3, [1, 0, Color.Green])}, [{kind: 'poke', position: xyToBigIntID(1, 1)}]);
	});

	it('the randomized replay: random histories, then one cycle in every order', async function () {
		const trials = Number(process.env.REPLAY_TRIALS ?? 25);
		const r = rng(Number(process.env.REPLAY_SEED ?? 1));
		let differing = 0;
		let numCalls = 0;
		let reverted = 0;
		const examples: string[] = [];
		for (let trial = 0; trial < trials; trial++) {
			const env = await loadFixture(deployWithPlayers);
			const numPlayers = 2 + r.int(MAX_PLAYERS - 1);
			const historyCycles = r.int(4);
			for (let c = 0; c < historyCycles; c++) {
				const plans: {[p: number]: Plan} = {};
				for (let p = 0; p < numPlayers; p++) if (r.int(3) > 0) plans[p] = randomPlan(r, 3, 1);
				if (Object.keys(plans).length > 0) await playCycle(env, plans);
				await skipCycles(env, r.int(4));
			}
			const plans: {[p: number]: Plan} = {};
			for (let p = 0; p < numPlayers; p++) plans[p] = randomPlan(r, 4, 1);
			const calls: Call[] = Object.keys(plans).map((p) => ({kind: 'reveal', player: Number(p)}));
			if (r.int(3) === 0) calls.push({kind: 'poke', position: xyToBigIntID(r.int(BOARD), r.int(BOARD))});
			for (const p of Object.keys(plans)) await commit(env, Number(p), plans[Number(p)]);
			await toRevealPhase(env);
			let orders = permutations(calls);
			if (orders.length > 6) {
				// past three calls, the identity, its reverse and four drawn at random
				const drawn = [orders[0], orders[orders.length - 1]];
				while (drawn.length < 6) drawn.push(orders[r.int(orders.length)]);
				orders = drawn;
			}
			const states = await replay(env, plans, orders);
			numCalls += orders.length * orders[0].length;
			reverted += states.reduce((n, s) => n + JSON.parse(s).reverted.filter((r: boolean) => r).length, 0);
			if (states.some((s) => s !== states[0])) {
				differing++;
				if (examples.length < 3) examples.push(`trial ${trial}: ${JSON.stringify(canonical(plans))}`);
				if (process.env.REPLAY_DIFF && differing <= 20) {
					const other = states.find((s) => s !== states[0])!;
					console.log(`trial ${trial} orders:`, JSON.stringify(canonical(orders)));
					console.log(`trial ${trial} differs at:`, diffPaths(JSON.parse(states[0]), JSON.parse(other)).join('\n'));
				}
			}
		}
		console.log(`order replay: ${differing} of ${trials} trials depend on the order (${reverted} of ${numCalls} calls reverted)`);
		for (const e of examples) console.log(e);
		expect(differing, examples.join('\n')).to.equal(0);
		// a revert is the same in every order, so a replay of reverts would pass: none may
		expect(reverted, 'calls reverted in the replay').to.equal(0);
	}, 60 * 60 * 1000 * 4);
});
