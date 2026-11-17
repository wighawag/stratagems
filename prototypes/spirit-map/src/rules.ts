/**
 * THROWAWAY PROTOTYPE. The rule the map draws, as in `proto/go-style`'s
 * `rules.ts` (the contract's `_computeNewLife` and `_effectiveDelta`): four
 * neighbours along the grid lines, a living cell grows by one a cycle if it has
 * more friends than enemies or no enemy at all, otherwise it shrinks by one;
 * life is 0 to 7. A dead cell STAYS, keeps its colour and keeps counting as a
 * friend or an enemy. Evil is a colour like the others (a collision), and only
 * Evil cells carry more than one gem at stake.
 */

export const MAX_LIFE = 7;
export const EVIL = 6;
export const ME = '0xme';

export type Cell = {
	x: number;
	y: number;
	/** 1 to 5 a faction, 6 evil. */
	color: number;
	life: number;
	/** Gems at stake: 1, or one per colliding player for Evil. */
	stake: number;
	owner: string;
};

export type Board = Map<string, Cell>;
/** Planned moves: a colour to place, or 0 to remove. */
export type Plans = Map<string, number>;

export const key = (x: number, y: number) => `${x},${y}`;

export const NEIGHBOURS = [
	[0, -1],
	[1, 0],
	[0, 1],
	[-1, 0],
] as const;

export type Trend = 'grow' | 'shrink' | 'full' | 'dead';

export type Pressure = {friends: number; enemies: number; trend: Trend};

export function pressureOf(board: Board, cell: Cell): Pressure {
	let friends = 0;
	let enemies = 0;
	for (const [dx, dy] of NEIGHBOURS) {
		const n = board.get(key(cell.x + dx, cell.y + dy));
		if (!n) continue;
		if (n.color === cell.color) friends++;
		else enemies++;
	}
	if (cell.life === 0) return {friends, enemies, trend: 'dead'};
	const grows = friends - enemies > 0 || enemies === 0;
	const trend: Trend = grows ? (cell.life >= MAX_LIFE ? 'full' : 'grow') : 'shrink';
	return {friends, enemies, trend};
}

/** The board one cycle on, the planned moves applied: placements start at 2. */
export function nextBoard(board: Board, plans: Plans): Board {
	const next: Board = new Map();
	for (const [k, cell] of board) {
		const {trend} = pressureOf(board, cell);
		let life = cell.life;
		if (trend === 'grow') life += 1;
		else if (trend === 'shrink') life -= 1;
		next.set(k, {...cell, life});
	}
	for (const [k, color] of plans) {
		const [x, y] = k.split(',').map(Number);
		if (color === 0) next.delete(k);
		else next.set(k, {x, y, color, life: 2, stake: 1, owner: ME});
	}
	return next;
}

/** A dense copy of the board over its bounding box, for fast lookups. */
export class Grid {
	readonly minX: number;
	readonly minY: number;
	readonly w: number;
	readonly h: number;
	readonly color: Uint8Array;
	readonly life: Uint8Array;
	readonly stake: Uint8Array;
	/** The viewer's cells. */
	readonly mine: Uint8Array;
	/** Draw the viewer's cells washed in ivory. */
	wash = false;

	constructor(
		readonly board: Board,
		pad = 4,
	) {
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const c of board.values()) {
			minX = Math.min(minX, c.x);
			minY = Math.min(minY, c.y);
			maxX = Math.max(maxX, c.x);
			maxY = Math.max(maxY, c.y);
		}
		if (!isFinite(minX)) minX = minY = maxX = maxY = 0;
		this.minX = minX - pad;
		this.minY = minY - pad;
		this.w = maxX - minX + 1 + 2 * pad;
		this.h = maxY - minY + 1 + 2 * pad;
		const n = this.w * this.h;
		this.color = new Uint8Array(n);
		this.life = new Uint8Array(n);
		this.stake = new Uint8Array(n);
		this.mine = new Uint8Array(n);
		for (const c of board.values()) {
			const i = this.index(c.x, c.y);
			this.color[i] = c.color;
			this.life[i] = c.life;
			this.stake[i] = c.stake;
			this.mine[i] = c.owner === ME ? 1 : 0;
		}
	}

	index(x: number, y: number): number {
		const i = x - this.minX;
		const j = y - this.minY;
		if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
		return i + j * this.w;
	}

	colorAt(x: number, y: number): number {
		const i = this.index(x, y);
		return i < 0 ? 0 : this.color[i];
	}
	lifeAt(x: number, y: number): number {
		const i = this.index(x, y);
		return i < 0 ? 0 : this.life[i];
	}
	stakeAt(x: number, y: number): number {
		const i = this.index(x, y);
		return i < 0 ? 0 : this.stake[i];
	}
}

/** A small deterministic generator. */
export function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function hash2(x: number, y: number, s = 0): number {
	let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

/** Smooth value noise, about -1 to 1. */
export function noise(x: number, y: number, s = 0): number {
	const xi = Math.floor(x),
		yi = Math.floor(y);
	const xf = x - xi,
		yf = y - yi;
	const u = xf * xf * (3 - 2 * xf),
		v = yf * yf * (3 - 2 * yf);
	const a = hash2(xi, yi, s),
		b = hash2(xi + 1, yi, s),
		c = hash2(xi, yi + 1, s),
		d = hash2(xi + 1, yi + 1, s);
	return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
