// Measurement for the 2026-10-24 specification of the port (see the plan): does the order of reveals within one epoch change the board?
// Uses stratagems' own TypeScript reimplementation of the contract (common/src/stratagems.ts).
// Run from the repo root after `pnpm install`: bundle it with esbuild (`--bundle --platform=node --format=esm --outfile=/tmp/order.mjs`), then
// `UI_ONLY=1 TRIALS=20000 SEED=2 node /tmp/order.mjs`. UI_ONLY=0 allows every move the contract accepts; ALLOW=other|none|ownmax|evil
// relaxes one of the client's rules; MIDCHECK=1 refuses a move onto another player's cell against the CURRENT board.
import {StratagemsContract, xyToBigIntID, Color} from '../../../common/src/index';

const MAX_LIFE = 7;
const PLAYERS = [
	'0x1000000000000000000000000000000000000001',
	'0x2000000000000000000000000000000000000002',
	'0x3000000000000000000000000000000000000003',
] as const;

let seed = Number(process.env.SEED || 1);
function rnd() {
	seed = (seed * 1103515245 + 12345) & 0x7fffffff;
	return seed / 0x7fffffff;
}
function pick<T>(a: readonly T[]): T {
	return a[Math.floor(rnd() * a.length)];
}

type Move = {player: `0x${string}`; position: bigint; color: Color};
type State = {cells: any; owners: any; computedPoints: any};

function clone(s: State): State {
	return JSON.parse(JSON.stringify(s));
}
function canon(s: State) {
	const norm = (o: any) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
	const points = Object.fromEntries(Object.entries(s.computedPoints).filter(([, v]) => v !== 0));
	return JSON.stringify({cells: norm(s.cells), owners: norm(s.owners), points: norm(points)});
}
function apply(s: State, epoch: number, moves: Move[]) {
	const c = new StratagemsContract(s as any, MAX_LIFE);
	for (const m of moves) {
		// MIDCHECK: a contract that refuses a move onto another player's cell, judged against the CURRENT state
		if (process.env.MIDCHECK === '1' && !midLegal(s, epoch, m)) continue;
		c.computeMove(m.player, epoch, {position: m.position, color: m.color});
	}
}
function midLegal(s: State, epoch: number, m: Move): boolean {
	const owner = (s.owners[m.position.toString()] || '0x0000000000000000000000000000000000000000').toLowerCase();
	if (m.color === Color.None) return true;
	return owner === m.player.toLowerCase() || owner === '0x0000000000000000000000000000000000000000';
}
function permutations<T>(a: T[]): T[][] {
	if (a.length <= 1) return [a];
	return a.flatMap((x, i) => permutations([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p]));
}

const SIZE = 3; // a 3x3 board keeps collisions and neighbours frequent
const positions: bigint[] = [];
for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) positions.push(xyToBigIntID(x, y));
const colors = [Color.Blue, Color.Red, Color.Green];

// what the client lets a player do against the start-of-epoch board (web/src/lib/stratagems/actions/ActionHandler.ts)
function uiLegal(s: State, epoch: number, m: Move): boolean {
	const c = new StratagemsContract(clone(s) as any, MAX_LIFE);
	const owner = (s.owners[m.position.toString()] || '0x0000000000000000000000000000000000000000').toLowerCase();
	const exists = !!s.cells[m.position.toString()];
	const life = exists ? c.getUpdatedCell(m.position, epoch).updatedCell.life : 0;
	const mine = owner === m.player.toLowerCase();
	const allow = (process.env.ALLOW || '').split(',');
	if (m.color === Color.None) return allow.includes('none') || (exists && mine && life === MAX_LIFE); // the land menu's "remove"
	if (exists && mine && life === MAX_LIFE) return allow.includes('ownmax'); // menu only
	if (exists && !mine && owner !== '0x0000000000000000000000000000000000000000')
		return (
			allow.includes('other') || (allow.includes('evil') && owner === '0xffffffffffffffffffffffffffffffffffffffff')
		); // someone else's: menu only
	return true;
}

const TRIALS = Number(process.env.TRIALS || 3000);
const UI_ONLY = process.env.UI_ONLY === '1';
let differing = 0;
let tried = 0;
const examples: string[] = [];
for (let t = 0; t < TRIALS; t++) {
	const s: State = {cells: {}, owners: {}, computedPoints: {}};
	// history: a few epochs of random play, one player at a time so history itself is order-free
	let epoch = 2;
	const historyEpochs = 1 + Math.floor(rnd() * 8);
	for (let e = 0; e < historyEpochs; e++) {
		const moves: Move[] = [];
		const used = new Set<string>();
		for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) {
			const m = {player: pick(PLAYERS), position: pick(positions), color: pick(colors)} as Move;
			if (used.has(m.position.toString())) continue;
			used.add(m.position.toString());
			if (UI_ONLY && !uiLegal(s, epoch, m)) continue;
			moves.push(m);
		}
		apply(s, epoch, moves);
		epoch += 1 + Math.floor(rnd() * 3);
	}
	// the epoch under test: each player commits 1 to 3 moves, all against the same start-of-epoch board
	const turns: Move[][] = PLAYERS.map((player) => {
		const ms: Move[] = [];
		for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) {
			const m = {player, position: pick(positions), color: rnd() < 0.15 ? Color.None : pick(colors)} as Move;
			if (ms.find((x) => x.position === m.position)) continue;
			if (UI_ONLY && !uiLegal(s, epoch, m)) continue;
			ms.push(m);
		}
		return ms;
	});
	tried++;
	const results = new Map<string, number[]>();
	for (const order of permutations([0, 1, 2])) {
		const st = clone(s);
		for (const i of order) apply(st, epoch, turns[i]);
		const k = canon(st);
		results.set(k, order);
	}
	if (results.size > 1) {
		differing++;
		if (examples.length < 3) {
			examples.push(
				JSON.stringify(
					{
						epoch,
						before: canon(s),
						turns: turns.map((ms) =>
							ms.map((m) => ({p: m.player.slice(0, 3), pos: m.position.toString(), c: m.color})),
						),
						outcomes: [...results.entries()].map(([k, o]) => ({order: o, state: k})),
					},
					(_, v) => (typeof v === 'bigint' ? v.toString() : v),
				),
			);
		}
	}
}
console.log(JSON.stringify({UI_ONLY, tried, differing}));
for (const e of examples) console.log(e.slice(0, 3000));
