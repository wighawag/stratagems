/**
 * `StratagemsSimulation` ANSWERS WHAT A REVEAL THEN DOES: the touched cells
 * after the turn (every field, the owner and the start record included), the
 * payouts, the point changes and the cost, held against the chain itself.
 *
 * Before every reveal and every poke of a random history, the stored state of
 * every cell the call can read (its moves' cells and their neighbours) is read
 * through the debug route, handed to the simulation, and its answer kept; then
 * the call is sent, and the same cells, every wallet's balance change and every
 * account's generator points are compared with it. Several players reveal in
 * one cycle, so a later reveal is simulated over the start records an earlier
 * one wrote; cycles are skipped, so cells die between reveals.
 *
 * The simulation's `cellAtCycle` is held to the getters on every cell read.
 *
 * And at the end of every history, the indexer's state (the processor folding
 * `CellsWritten`, step X2's PX5) is held to what the contract stores, cell by
 * cell and owner by owner, over the whole board and its ring.
 *
 * `SIMULATION_TRIALS` (default 12) and `SIMULATION_SEED` (default 7) size it.
 */
import {expect, describe, it} from 'vitest';
import {encodeAbiParameters, keccak256, parseEther, zeroAddress} from 'viem';
import {Color, EVIL_OWNER_ADDRESS, xyToBigIntID, bigIntIDToXY, zeroBytes24} from 'stratagems-common';
import {getConnection, loadFixture} from '../utils/connection.js';
import {deployStratagemsWithTestConfig, indexedState} from './utils/stratagems-test.js';
import {increaseTime} from './utils/stratagems.js';

type Env = Awaited<ReturnType<typeof deployStratagemsWithTestConfig>>;
type Move = {position: bigint; color: Color};
type Plan = {moves: Move[]; secret: `0x${string}`};

const BURN = '0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddead';
const BOARD = 4;
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

function hashOf(moves: Move[], secret: `0x${string}`): `0x${string}` {
	const movesType = {
		type: 'tuple[]',
		components: [
			{name: 'position', type: 'uint64'},
			{name: 'color', type: 'uint8'},
		],
	} as const;
	return keccak256(
		encodeAbiParameters([{type: 'bytes32'}, movesType, {type: 'bytes24'}], [secret, moves, zeroBytes24]),
	).slice(0, 50) as `0x${string}`;
}

function randomPlan(r: ReturnType<typeof rng>, maxMoves: number): Plan {
	const n = 1 + r.int(maxMoves);
	const moves: Move[] = [];
	for (let i = 0; i < n; i++) {
		const roll = r.int(20);
		const color = roll === 0 ? Color.Evil : roll < 4 ? Color.None : ((1 + r.int(5)) as Color);
		moves.push({position: xyToBigIntID(r.int(BOARD), r.int(BOARD)), color});
	}
	const secret = `0x${Array.from({length: 32}, () => r.int(256).toString(16).padStart(2, '0')).join('')}` as const;
	return {moves, secret};
}

async function deployWithPlayers() {
	const env = await deployStratagemsWithTestConfig();
	for (const player of env.otherAccounts.slice(0, MAX_PLAYERS)) {
		await env.TestTokens.write.transfer([player, parseEther('100')], {account: env.tokensBeneficiary});
		await env.TestTokens.write.approve([env.Stratagems.address, parseEther('100')], {account: player});
	}
	return env;
}

/** The cell and its four neighbours, each once, in the simulation's order. */
function touchedBy(centres: bigint[]): bigint[] {
	const touched: bigint[] = [];
	for (const centre of centres) {
		const {x, y} = bigIntIDToXY(centre);
		for (const [dx, dy] of [
			[0, 0],
			[0, -1],
			[-1, 0],
			[0, 1],
			[1, 0],
		]) {
			const id = xyToBigIntID(x + dx, y + dy);
			if (!touched.includes(id)) touched.push(id);
		}
	}
	return touched;
}

/** The cells as the game stores them, through the debug route. */
async function storedCells(env: Env, ids: bigint[]) {
	const S = env.Stratagems as any;
	return Promise.all(
		ids.map(async (position) => ({
			position,
			owner: (await S.read.getRawOwner([position])) as `0x${string}`,
			cell: await S.read.getRawCell([position]),
			start: await S.read.getRawCellAtCycleStart([position]),
		})),
	);
}

function accountsOf(env: Env): `0x${string}`[] {
	return [...env.otherAccounts.slice(0, MAX_PLAYERS), EVIL_OWNER_ADDRESS as `0x${string}`, BURN];
}

async function balances(env: Env) {
	const accounts = accountsOf(env);
	return {
		tokens: await Promise.all(accounts.map((a) => env.TestTokens.read.balanceOf([a]))),
		points: await Promise.all(accounts.map((a) => env.GemsGenerator.read.balanceOf([a]))),
	};
}

const lower = (a: string) => a.toLowerCase();

/** What the simulation says each account receives and holds, in the order of `accountsOf`. */
function expectedDeltas(env: Env, outcome: any) {
	const accounts = accountsOf(env).map(lower);
	const tokens = accounts.map(() => 0n);
	const points = accounts.map(() => 0n);
	for (const payout of outcome.payouts) {
		const i = accounts.indexOf(lower(payout.to));
		expect(i, `a payout to ${payout.to}, an account the test does not watch`).to.not.equal(-1);
		tokens[i] += payout.amount;
	}
	for (const change of outcome.points) {
		const i = accounts.indexOf(lower(change.owner));
		expect(i, `points of ${change.owner}, an account the test does not watch`).to.not.equal(-1);
		points[i] += change.added ? change.amount : -change.amount;
	}
	return {tokens, points};
}

const normalise = (cells: any[]) =>
	cells.map((c) => ({
		position: c.position,
		owner: lower(c.owner),
		cell: {...c.cell},
		start: {...c.start, owner: lower(c.start.owner)},
	}));

/** The indexer's cells and owners against the contract's storage, over the board and its ring. */
async function expectIndexedAsStored(env: Env) {
	const indexed = await indexedState(env as any);
	const ids: bigint[] = [];
	for (let y = -1; y <= BOARD; y++) for (let x = -1; x <= BOARD; x++) ids.push(xyToBigIntID(x, y));
	const stored = await storedCells(env, ids);
	const zero = {
		lastCycleUpdate: 0,
		cycleWhenTokenIsAdded: 0,
		producingCycles: 0,
		color: 0,
		life: 0,
		delta: 0,
		enemyMap: 0,
		distribution: 0,
		stake: 0,
	};
	for (const {position, owner, cell} of stored) {
		const key = position.toString();
		expect({...zero, ...indexed.cells[key]}, `the indexed cell ${key}`).to.deep.equal({...zero, ...cell});
		expect(lower(indexed.owners[key] ?? zeroAddress), `the indexed owner of ${key}`).to.equal(lower(owner));
	}
	checked.indexed += stored.length;
}

let checked = {reveals: 0, pokes: 0, payouts: 0, points: 0, cells: 0, indexed: 0};

/** Simulate `send` over the stored cells it can read, send it, and hold the answer to what it did. */
async function expectSimulated(env: Env, centres: bigint[], simulate: (board: any[]) => Promise<any>, send: () => Promise<void>) {
	const touched = touchedBy(centres);
	const board = await storedCells(env, touched);

	// the projection, on every cell read: the simulation's `cellAtCycle` is the getters'
	const cycleNumber = await (env.Stratagems as any).read.getCycleNumber();
	const projected = await (env.Stratagems as any).read.getCells([touched]);
	for (let i = 0; i < board.length; i++) {
		const {result} = await env.StratagemsSimulation.simulate.cellAtCycle([board[i].cell, Number(cycleNumber[0])]);
		const [cell] = result as any;
		const fromGetter = projected[i];
		for (const key of Object.keys(cell)) {
			expect(cell[key], `cellAtCycle ${key}`).to.equal(fromGetter[key]);
		}
	}

	const outcome = await simulate(board);
	const before = await balances(env);
	await send();
	const after = await balances(env);

	const cellsAfter = await storedCells(env, touched);
	expect(normalise(outcome.cells as any[]), 'the touched cells after the turn').to.deep.equal(normalise(cellsAfter));

	const expected = expectedDeltas(env, outcome);
	expect(
		after.tokens.map((v, i) => v - before.tokens[i]),
		'what each wallet received',
	).to.deep.equal(expected.tokens);
	expect(
		after.points.map((v, i) => v - before.points[i]),
		"each account's points",
	).to.deep.equal(expected.points);
	checked.payouts += outcome.payouts.length;
	checked.points += outcome.points.length;
	checked.cells += outcome.cells.length;
	return outcome;
}

async function playCycle(env: Env, r: ReturnType<typeof rng>, plans: {[player: number]: Plan}) {
	const S = env.Stratagems as any;
	const players = Object.keys(plans).map(Number);
	for (const p of players) {
		const amount = parseEther(`${plans[p].moves.length}`);
		await S.write.makeCommitmentWithExtraReserve(
			[BigInt(env.otherAccounts[p]), hashOf(plans[p].moves, plans[p].secret), amount, amount, zeroAddress],
			{account: env.otherAccounts[p]},
		);
	}
	await increaseTime(env.config.commitPhaseDuration);
	const [cycleNumber] = await S.read.getCycleNumber();
	const cycle = Number(cycleNumber);
	const calls: ({player: number} | {poke: bigint})[] = players.map((player) => ({player}));
	if (r.int(2) === 0) calls.splice(r.int(calls.length + 1), 0, {poke: xyToBigIntID(r.int(BOARD), r.int(BOARD))});
	for (const call of calls) {
		if ('player' in call) {
			const player = env.otherAccounts[call.player];
			const {moves, secret} = plans[call.player];
			const reserveBefore = await S.read.getReserve([BigInt(player)]);
			const outcome = await expectSimulated(
				env,
				moves.map((m) => m.position),
				async (board) =>
					(await env.StratagemsSimulation.simulate.resolveMoves([board, player, cycle, moves])).result,
				async () => {
					await S.write.reveal([BigInt(player), moves, secret, zeroBytes24, zeroAddress], {
						account: env.stratagemsAdmin,
					});
				},
			);
			// the bond was the whole turn, and what it did not cost is back in the reserve
			const reserveAfter = await S.read.getReserve([BigInt(player)]);
			expect(reserveBefore - reserveAfter, 'the cost').to.equal(outcome.cost);
			checked.reveals++;
		} else {
			await expectSimulated(
				env,
				[call.poke],
				async (board) => (await env.StratagemsSimulation.simulate.poke([board, cycle, [call.poke]])).result,
				async () => {
					await S.write.poke([call.poke], {account: env.stratagemsAdmin});
				},
			);
			checked.pokes++;
		}
	}
	await increaseTime(env.config.revealPhaseDuration);
}

describe('StratagemsSimulation: what a turn will do, by the reveal’s own code', function () {
	it(
		'answers every reveal and poke of random histories as the chain then does',
		async function () {
			const trials = Number(process.env.SIMULATION_TRIALS ?? 12);
			const r = rng(Number(process.env.SIMULATION_SEED ?? 7));
			checked = {reveals: 0, pokes: 0, payouts: 0, points: 0, cells: 0, indexed: 0};
			for (let trial = 0; trial < trials; trial++) {
				const env = await loadFixture(deployWithPlayers);
				const cycles = 2 + r.int(4);
				for (let c = 0; c < cycles; c++) {
					const plans: {[p: number]: Plan} = {};
					for (let p = 0; p < MAX_PLAYERS; p++) if (r.int(3) > 0) plans[p] = randomPlan(r, 5);
					if (Object.keys(plans).length > 0) await playCycle(env, r, plans);
					const skip = r.int(4);
					if (skip > 0) {
						await increaseTime(BigInt(skip) * (env.config.commitPhaseDuration + env.config.revealPhaseDuration));
					}
				}
				await expectIndexedAsStored(env);
			}
			console.log(
				`simulation: ${checked.reveals} reveals and ${checked.pokes} pokes, ${checked.cells} cells, ${checked.payouts} payouts and ${checked.points} point changes held to the chain; ${checked.indexed} indexed cells held to storage`,
			);
			// the history must exercise what it claims to check
			expect(checked.payouts).to.be.greaterThan(0);
			expect(checked.points).to.be.greaterThan(0);
		},
		60 * 60 * 1000,
	);
});
