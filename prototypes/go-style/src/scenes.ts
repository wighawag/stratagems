/** THROWAWAY PROTOTYPE. A hard-coded board holding every situation to judge. */
import {type Board, type Cell, EVIL, key} from './rules';

export const ME = '0x1d3a5e7f00000000000000000000000000c0ffee';
export const OWNERS = {
	me: ME,
	b: '0x8ba1f109551bd432803012645ac136ddd64dba72',
	c: '0xab5801a7d398351b8be11c439e05c5b3259aec9b',
	d: '0x4e9ce36e442e55ecd9025b9a6e0d88485d628a67',
	e: '0xfe9e8709d3215310075d67e3ed32a380ccf451c8',
	f: '0x00000000219ab540356cbb839cbe05303d7705fa',
} as const;

const BLUE = 1,
	RED = 2,
	GREEN = 3,
	YELLOW = 4,
	PURPLE = 5;

export type Label = {x: number; y: number; text: string};

export const LABELS: Label[] = [
	{x: -0.4, y: -1.2, text: 'A growing friendly group (blue, three owners, mine have a dot)'},
	{x: 7.6, y: -1.2, text: 'A contested edge: blue against red'},
	{x: 14.6, y: -1.2, text: 'A dying stone (life 1, two enemies)'},
	{x: -0.4, y: 5.8, text: 'Life 1 to 7, growing (no enemy)'},
	{x: -0.4, y: 8.1, text: 'Life 1 to 7, shrinking (each touches an Evil cell, flat charcoal)'},
	{x: 23.6, y: -4.2, text: 'A random field, for the far zoom'},
	{x: 14.6, y: 4.8, text: 'One faction, four owners; 3 gems on one cell'},
	{x: 3.6, y: 3.2, text: 'Planned: ghost = place, cross = remove'},
];

function c(x: number, y: number, color: number, life: number, owner: string, extra: Partial<Cell> = {}): Cell {
	return {x, y, color, life, stake: 1, owner, ...extra};
}

export const FIELD = {x0: 24, y0: -3, w: 44, h: 30};

/** A seeded random field of factions, so the far zoom has something to show. */
function field(): Cell[] {
	let seed = 12345;
	const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
	const owners: string[] = (Object.values(OWNERS) as string[]).concat([
		'0x2222222222222222222222222222222222222222',
		'0x9999999999999999999999999999999999990001',
		'0x7777777777777777777777777777777777777abc',
	]);
	const seeds = Array.from({length: 14}, () => ({
		x: FIELD.x0 + rand() * FIELD.w,
		y: FIELD.y0 + rand() * FIELD.h,
		color: 1 + Math.floor(rand() * 5),
		owner: owners[Math.floor(rand() * owners.length)],
	}));
	const out: Cell[] = [];
	for (let y = FIELD.y0; y < FIELD.y0 + FIELD.h; y++)
		for (let x = FIELD.x0; x < FIELD.x0 + FIELD.w; x++) {
			if (rand() > 0.62) continue;
			let best = seeds[0];
			let bd = Infinity;
			for (const s of seeds) {
				const d = (s.x - x) ** 2 + (s.y - y) ** 2;
				if (d < bd) [bd, best] = [d, s];
			}
			if (rand() < 0.03) {
				out.push(c(x, y, EVIL, 7, '0x0000000000000000000000000000000000000000'));
				continue;
			}
			const owner = rand() < 0.7 ? best.owner : owners[Math.floor(rand() * owners.length)];
			out.push(c(x, y, best.color, 1 + Math.floor(rand() * 7), owner, {stake: rand() < 0.1 ? 2 : 1}));
		}
	return out;
}

export function initialBoard(): Board {
	const {me, b, c: cc, d, e, f} = OWNERS;
	const cells: Cell[] = [
		// A: a growing blue group, three owners.
		c(0, 0, BLUE, 3, me),
		c(1, 0, BLUE, 4, me),
		c(2, 0, BLUE, 5, b),
		c(0, 1, BLUE, 2, me, {planned: 'remove'}),
		c(1, 1, BLUE, 6, b),
		c(2, 1, BLUE, 7, cc),
		c(1, 2, BLUE, 1, cc),
		c(3, 1, BLUE, 3, b),
		// planned placements (ghosts)
		c(3, 2, BLUE, 1, me, {planned: 'place'}),
		c(5, 4, BLUE, 1, me, {planned: 'place'}),

		// B: the contested edge.
		...[0, 1, 2, 3, 4].flatMap((y) => [c(8, y, BLUE, [6, 5, 7, 4, 6][y], [b, cc, b, me, cc][y]), c(9, y, BLUE, [4, 3, 2, 5, 3][y], [cc, b, me, b, cc][y])]),
		c(10, 0, RED, 4, d),
		c(10, 2, RED, 3, d),
		c(10, 4, RED, 2, e),
		c(11, 1, RED, 5, d),
		c(11, 2, RED, 6, e),
		c(11, 3, RED, 4, d),

		// C: a dying stone.
		c(16, 1, PURPLE, 1, f),
		c(15, 1, RED, 5, e),
		c(17, 1, BLUE, 6, b),

		// D: the growing ladder.
		...[1, 2, 3, 4, 5, 6, 7].map((life, i) => c(i * 2, 7, GREEN, life, [me, b, cc, d, e, f, me][i])),

		// E: the shrinking ladder, each under an Evil cell.
		...[1, 2, 3, 4, 5, 6, 7].flatMap((life, i) => [c(i * 2, 10, YELLOW, life, [d, e, f, me, b, cc, d][i]), c(i * 2, 9.0 + 0, EVIL, 7, '0x0000000000000000000000000000000000000000')]),

		// F: one faction, four owners, a stake of 3.
		c(15, 6, GREEN, 5, b),
		c(16, 6, GREEN, 6, b),
		c(17, 6, GREEN, 4, cc),
		c(15, 7, GREEN, 3, d),
		c(16, 7, GREEN, 7, me, {stake: 3}),
		c(17, 7, GREEN, 5, cc),
		c(16, 8, GREEN, 2, e),
	];
	const board: Board = new Map();
	for (const cell of cells) board.set(key(cell.x, cell.y), cell);
	for (const cell of field()) board.set(key(cell.x, cell.y), cell);
	return board;
}
