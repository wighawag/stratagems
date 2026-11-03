/**
 * POKING CHANGES WHEN GEMS MOVE, NEVER WHO GETS THEM (the plan's step L4,
 * L4-1 and L4-9). A table's end rests on it: its final board is each cell taken
 * `MAX_LIFE` cycles past the last one and poked there, which is only the same
 * as playing those cycles out if a poke never changes an outcome, only brings
 * it forward.
 *
 * `Stratagems.order.test.ts` asserts that the ORDER of one cycle's reveals and
 * pokes does not matter. This asserts the other half, across cycles: the same
 * random history played twice from the same chain, once with random pokes
 * between and within its cycles and once with none, then every coloured cell
 * poked `MAX_LIFE` cycles after the last in both. Compared: every cell of the
 * board and its ring (all fields, owner included), every player's wallet and
 * reserve, the game's and the burn address's balances. Not the generator's
 * points and rewards: they accrue with TIME held, and a poke moves when a gem
 * is held, which is what a poke is for.
 *
 * `POKE_TRIALS` (default 25) and `POKE_SEED` (default 1) size it; the step's
 * measurement ran it with POKE_TRIALS=2000.
 */
import {expect, describe, it} from 'vitest';
import {encodeAbiParameters, keccak256, parseEther, zeroAddress} from 'viem';
import {Color, xyToBigIntID, zeroBytes24} from 'stratagems-common';
import {hardhatProvider, loadFixture} from '../utils/connection.js';
import {deployStratagemsWithTestConfig} from './utils/stratagems-test.js';
import {increaseTime} from './utils/stratagems.js';

type Env = Awaited<ReturnType<typeof deployStratagemsWithTestConfig>>;
type Move = {position: bigint; color: Color};
type Plan = {moves: Move[]; secret: `0x${string}`};
/** One cycle of a history: who plays what, and where the pokes go when there are any. */
type HistoryCycle = {
	plans: {[player: number]: Plan};
	/** in the commit phase, before anyone commits */
	pokesBeforeCommits: bigint[];
	/** after the reveal of the player at that index of the reveal order */
	pokesAfterReveal: bigint[][];
	/** once the reveal phase has closed */
	pokesAfterCycle: bigint[];
	/** whole cycles nobody plays, after this one */
	idleCycles: number;
};

const BURN = '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead';
const EVIL_OWNER = '0xffffffffffffffffffffffffffffffffffffffff';
const BOARD = 4; // moves land on a BOARD x BOARD square
const PLAYERS = 4;
const CYCLES = 12;

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

const position = (r: ReturnType<typeof rng>) => xyToBigIntID(r.int(BOARD), r.int(BOARD));

function randomPlan(r: ReturnType<typeof rng>): Plan {
	const n = 1 + r.int(3);
	const moves: Move[] = [];
	for (let i = 0; i < n; i++) {
		// None (a removal) and the five colours; Evil, which only a collision should make, now and then
		const roll = r.int(20);
		const color = roll === 0 ? Color.Evil : roll < 4 ? Color.None : ((1 + r.int(5)) as Color);
		moves.push({position: position(r), color});
	}
	const secret = `0x${Array.from({length: 32}, () => r.int(256).toString(16).padStart(2, '0')).join('')}` as const;
	return {moves, secret};
}

function randomPokes(r: ReturnType<typeof rng>, most: number): bigint[] {
	return Array.from({length: r.int(most + 1)}, () => position(r));
}

function randomHistory(r: ReturnType<typeof rng>): HistoryCycle[] {
	const history: HistoryCycle[] = [];
	for (let c = 0; c < CYCLES; c++) {
		const plans: {[p: number]: Plan} = {};
		for (let p = 0; p < PLAYERS; p++) if (r.int(3) > 0) plans[p] = randomPlan(r);
		const numPlans = Object.keys(plans).length;
		history.push({
			plans,
			pokesBeforeCommits: randomPokes(r, 2),
			pokesAfterReveal: Array.from({length: numPlans}, () => randomPokes(r, 1)),
			pokesAfterCycle: randomPokes(r, 2),
			idleCycles: r.int(4) === 0 ? 1 + r.int(2) : 0,
		});
	}
	return history;
}

function hashOf(moves: Move[], secret: `0x${string}`): `0x${string}` {
	const movesType = {
		type: 'tuple[]',
		components: [
			{name: 'position', type: 'uint64'},
			{name: 'color', type: 'uint8'},
		],
	} as const;
	const encoded = encodeAbiParameters([{type: 'bytes32'}, movesType, {type: 'bytes24'}], [secret, moves, zeroBytes24]);
	return keccak256(encoded).slice(0, 50) as `0x${string}`;
}

async function deployWithPlayers() {
	const env = await deployStratagemsWithTestConfig();
	for (const player of env.otherAccounts.slice(0, PLAYERS)) {
		await env.TestTokens.write.transfer([player, parseEther('100')], {account: env.tokensBeneficiary});
		await env.TestTokens.write.approve([env.Stratagems.address, parseEther('100')], {account: player});
	}
	return env;
}

async function poke(env: Env, positions: bigint[]) {
	const S = env.Stratagems as any;
	for (const p of positions) await S.write.poke([p], {account: env.stratagemsAdmin});
}

const cyclesOf = (env: Env, n: number) => BigInt(n) * (env.config.commitPhaseDuration + env.config.revealPhaseDuration);

/** Play `history` from the start of a commit phase; with `withPokes`, its pokes too. */
async function play(env: Env, history: HistoryCycle[], withPokes: boolean) {
	const S = env.Stratagems as any;
	for (const cycle of history) {
		if (withPokes) await poke(env, cycle.pokesBeforeCommits);
		const players = Object.keys(cycle.plans).map(Number);
		for (const p of players) {
			const player = env.otherAccounts[p];
			const {moves, secret} = cycle.plans[p];
			// the bond covers every move, so no history makes a reveal fail for lack of it
			const amount = parseEther(`${Math.max(moves.length, 1)}`);
			await S.write.makeCommitmentWithExtraReserve(
				[BigInt(player), hashOf(moves, secret), amount, amount, zeroAddress],
				{account: player},
			);
		}
		await increaseTime(env.config.commitPhaseDuration);
		for (const [i, p] of players.entries()) {
			const {moves, secret} = cycle.plans[p];
			await S.write.reveal([BigInt(env.otherAccounts[p]), moves, secret, zeroBytes24, zeroAddress], {
				account: env.stratagemsAdmin,
			});
			if (withPokes) await poke(env, cycle.pokesAfterReveal[i]);
		}
		await increaseTime(env.config.revealPhaseDuration);
		if (withPokes) await poke(env, cycle.pokesAfterCycle);
		if (cycle.idleCycles > 0) await increaseTime(cyclesOf(env, cycle.idleCycles));
	}
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

function boardIds(): bigint[] {
	const ids: bigint[] = [];
	for (let y = -1; y <= BOARD; y++) for (let x = -1; x <= BOARD; x++) ids.push(xyToBigIntID(x, y));
	return ids;
}

/** `MAX_LIFE` cycles after the last, every coloured cell poked: the settled board. */
async function settle(env: Env) {
	await increaseTime(cyclesOf(env, env.config.maxLife));
	const S = env.Stratagems as any;
	const cells = (await S.read.getCells([boardIds()])) as {color: number}[];
	const coloured = boardIds().filter((_, i) => cells[i].color !== Color.None);
	await poke(env, coloured);
	return coloured.length;
}

async function readState(env: Env) {
	const S = env.Stratagems as any;
	const cells = await S.read.getCells([boardIds()]);
	const accounts = [...env.otherAccounts.slice(0, PLAYERS), env.Stratagems.address, BURN, EVIL_OWNER];
	const balances = await Promise.all(accounts.map((a) => env.TestTokens.read.balanceOf([a as `0x${string}`])));
	const reserves = await Promise.all(env.otherAccounts.slice(0, PLAYERS).map((a) => S.read.getReserve([BigInt(a)])));
	return canonical({cells, balances, reserves}) as Record<string, unknown>;
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

/** The same history from the same chain, poked and not, each settled; the two states. */
async function bothWays(env: Env, history: HistoryCycle[]) {
	const provider = hardhatProvider as any;
	const states: Record<string, unknown>[] = [];
	let coloured = 0;
	for (const withPokes of [true, false]) {
		const snapshot = await provider.request({method: 'evm_snapshot', params: []});
		await play(env, history, withPokes);
		coloured = await settle(env);
		states.push(await readState(env));
		await provider.request({method: 'evm_revert', params: [snapshot]});
	}
	return {poked: states[0], unpoked: states[1], coloured};
}

describe('Stratagems: poking or not never changes the outcome', function () {
	it('a cell surrounded and killed, poked at its death or only at the end', async function () {
		const env = await loadFixture(deployWithPlayers);
		const at = (x: number, y: number) => xyToBigIntID(x, y);
		const secret = (n: number) => `0x${n.toString(16).padStart(64, '0')}` as `0x${string}`;
		const history: HistoryCycle[] = [
			{
				plans: {
					0: {moves: [{position: at(1, 1), color: Color.Blue}], secret: secret(1)},
					1: {
						moves: [
							{position: at(0, 1), color: Color.Red},
							{position: at(1, 0), color: Color.Red},
							{position: at(2, 1), color: Color.Red},
						],
						secret: secret(2),
					},
				},
				pokesBeforeCommits: [],
				pokesAfterReveal: [[], []],
				// poked every cycle while it dies
				pokesAfterCycle: [at(1, 1)],
				idleCycles: 0,
			},
			...Array.from({length: 4}, () => ({
				plans: {},
				pokesBeforeCommits: [at(1, 1), at(0, 1)],
				pokesAfterReveal: [],
				pokesAfterCycle: [at(1, 1)],
				idleCycles: 0,
			})),
		];
		const {poked, unpoked} = await bothWays(env, history);
		expect(diffPaths(poked, unpoked), 'what poking changed').to.deep.equal([]);
	});

	it(
		'the randomized histories: poked between and within cycles, or never, then settled',
		async function () {
			const trials = Number(process.env.POKE_TRIALS ?? 25);
			const r = rng(Number(process.env.POKE_SEED ?? 1));
			let differing = 0;
			let coloured = 0;
			const examples: string[] = [];
			for (let trial = 0; trial < trials; trial++) {
				const env = await loadFixture(deployWithPlayers);
				const history = randomHistory(r);
				const result = await bothWays(env, history);
				coloured += result.coloured;
				const diff = diffPaths(result.poked, result.unpoked);
				if (diff.length > 0) {
					differing++;
					if (examples.length < 3) {
						examples.push(`trial ${trial}: ${diff.slice(0, 8).join('; ')}\n${JSON.stringify(canonical(history))}`);
					}
				}
			}
			console.log(
				`poke replay: ${differing} of ${trials} histories depend on poking (${coloured} coloured cells settled in all)`,
			);
			for (const e of examples) console.log(e);
			expect(differing, examples.join('\n')).to.equal(0);
		},
		60 * 60 * 1000 * 8,
	);
});
