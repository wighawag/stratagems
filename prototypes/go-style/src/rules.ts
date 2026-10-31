/**
 * THROWAWAY PROTOTYPE. The decisions the board draws, as pure functions over
 * the cells: what a real step would unit-test. The rule is the contract's
 * (`contracts/src/game/internal/UsingStratagemsState.sol`, `_computeNewLife`
 * and `_effectiveDelta`): four neighbours along the grid lines, a living cell
 * grows by one a cycle if it has more friends than enemies or no enemy at all,
 * and otherwise shrinks by one; life is 0 to 7.
 */

export const MAX_LIFE = 7;
export const EVIL = 6;

export type Cell = {
	x: number;
	y: number;
	/** 1 to 5 a faction, 6 evil. */
	color: number;
	life: number;
	/** Gems at stake on the cell. */
	stake: number;
	owner: string;
	/** A planned move the player has not committed yet. */
	planned?: 'place' | 'remove';
};

export type Board = Map<string, Cell>;

export const key = (x: number, y: number) => `${x},${y}`;

export const NEIGHBOURS = [
	[0, -1],
	[1, 0],
	[0, 1],
	[-1, 0],
] as const;

/** A cell that takes part in the rule (a planned placement does not yet). */
function alive(cell: Cell | undefined): cell is Cell {
	return !!cell && cell.life > 0 && cell.planned !== 'place';
}

export type Trend = 'grow' | 'shrink' | 'full' | 'static';

export type Pressure = {friends: number; enemies: number; trend: Trend};

export function pressureOf(board: Board, cell: Cell): Pressure {
	let friends = 0;
	let enemies = 0;
	for (const [dx, dy] of NEIGHBOURS) {
		const n = board.get(key(cell.x + dx, cell.y + dy));
		if (!alive(n)) continue;
		if (n.color === cell.color) friends++;
		else enemies++;
	}
	if (cell.color === EVIL || cell.planned === 'place') return {friends, enemies, trend: 'static'};
	const grows = friends - enemies > 0 || enemies === 0;
	const trend: Trend = grows ? (cell.life >= MAX_LIFE ? 'full' : 'grow') : 'shrink';
	return {friends, enemies, trend};
}

/** One grid-line segment between two neighbours, and what it carries. */
export type Link = {ax: number; ay: number; bx: number; by: number; kind: 'bridge' | 'notch'};

/** Bridges join friends, notches mark an enemy contact; each pair once. */
export function linksOf(board: Board): Link[] {
	const links: Link[] = [];
	for (const cell of board.values()) {
		if (!alive(cell)) continue;
		for (const [dx, dy] of [
			[1, 0],
			[0, 1],
		]) {
			const n = board.get(key(cell.x + dx, cell.y + dy));
			if (!alive(n)) continue;
			links.push({
				ax: cell.x,
				ay: cell.y,
				bx: n.x,
				by: n.y,
				kind: n.color === cell.color && cell.color !== EVIL ? 'bridge' : 'notch',
			});
		}
	}
	return links;
}

/** The board one cycle on: every living non-evil cell moves by exactly one. */
export function nextBoard(board: Board): Board {
	const next: Board = new Map();
	for (const [k, cell] of board) {
		const {trend} = pressureOf(board, cell);
		let life = cell.life;
		if (trend === 'grow') life += 1;
		else if (trend === 'shrink') life -= 1;
		if (life <= 0) continue;
		next.set(k, {...cell, life});
	}
	return next;
}

export type OwnerSummary = {owner: string; cells: number; stake: number; colors: number[]};

export function ownerSummary(board: Board, owner: string): OwnerSummary {
	let cells = 0;
	let stake = 0;
	const colors = new Set<number>();
	for (const cell of board.values()) {
		if (cell.owner !== owner || cell.planned === 'place') continue;
		cells++;
		stake += cell.stake;
		colors.add(cell.color);
	}
	return {owner, cells, stake, colors: [...colors]};
}

/** The edges of an owner's connected groups: one unit segment per open side. */
export function ownerOutline(board: Board, owner: string): {x1: number; y1: number; x2: number; y2: number}[] {
	const segments: {x1: number; y1: number; x2: number; y2: number}[] = [];
	const mine = (x: number, y: number) => {
		const c = board.get(key(x, y));
		return !!c && c.owner === owner && c.planned !== 'place';
	};
	for (const cell of board.values()) {
		if (!mine(cell.x, cell.y)) continue;
		const {x, y} = cell;
		if (!mine(x, y - 1)) segments.push({x1: x - 0.5, y1: y - 0.5, x2: x + 0.5, y2: y - 0.5});
		if (!mine(x + 1, y)) segments.push({x1: x + 0.5, y1: y - 0.5, x2: x + 0.5, y2: y + 0.5});
		if (!mine(x, y + 1)) segments.push({x1: x - 0.5, y1: y + 0.5, x2: x + 0.5, y2: y + 0.5});
		if (!mine(x - 1, y)) segments.push({x1: x - 0.5, y1: y - 0.5, x2: x - 0.5, y2: y + 0.5});
	}
	return segments;
}
