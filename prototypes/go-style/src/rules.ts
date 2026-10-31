/**
 * THROWAWAY PROTOTYPE. The decisions the board draws, as pure functions over
 * the cells: what a real step would unit-test. The rule is the contract's
 * (`contracts/src/game/internal/UsingStratagemsState.sol`, `_computeNewLife`
 * and `_effectiveDelta`): four neighbours along the grid lines, a living cell
 * grows by one a cycle if it has more friends than enemies or no enemy at all,
 * and otherwise shrinks by one; life is 0 to 7, a placement starts at 2.
 *
 * A DEAD CELL STAYS (checked in `UsingStratagemsSetters.sol`): its colour is
 * never cleared, `_updateCell` judges friend or enemy by colour and not by
 * life, and a death changes no neighbour's delta, so it keeps pressing its
 * neighbours until someone places on it (it is free to anyone; it cannot be
 * removed, removal needs full life). Its stake has been paid to its enemies.
 *
 * EVIL IS A COLOUR LIKE THE OTHERS: placed at life 2 by a collision, it grows
 * and shrinks by the same rule, other Evil cells are its friends and every
 * faction its enemy; its owner is the contract's EVIL_OWNER.
 */

export const MAX_LIFE = 7;
export const EVIL = 6;
export const EVIL_OWNER = '0xffffffffffffffffffffffffffffffffffffffff';

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
	/**
	 * Evil only: the players whose colliding placements made it, one gem each
	 * (its stake). A normal cell's stake is always 1 (`_placeColor`); only a
	 * collision stacks gems, all in the cycle it happens (a move on a live Evil
	 * cell is skipped). The indexer keeps who placed where for 7 cycles only.
	 */
	contributors?: string[];
};

export type Board = Map<string, Cell>;

export const key = (x: number, y: number) => `${x},${y}`;

export const NEIGHBOURS = [
	[0, -1],
	[1, 0],
	[0, 1],
	[-1, 0],
] as const;

/** A cell that takes part in the rule: any coloured cell, dead or alive (a planned placement does not yet). */
function present(cell: Cell | undefined): cell is Cell {
	return !!cell && cell.planned !== 'place';
}

export type Trend = 'grow' | 'shrink' | 'full' | 'dead' | 'static';

export type Pressure = {friends: number; enemies: number; trend: Trend};

export function pressureOf(board: Board, cell: Cell): Pressure {
	let friends = 0;
	let enemies = 0;
	for (const [dx, dy] of NEIGHBOURS) {
		const n = board.get(key(cell.x + dx, cell.y + dy));
		if (!present(n)) continue;
		if (n.color === cell.color) friends++;
		else enemies++;
	}
	if (cell.planned === 'place') return {friends, enemies, trend: 'static'};
	if (cell.life === 0) return {friends, enemies, trend: 'dead'};
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
		if (!present(cell)) continue;
		for (const [dx, dy] of [
			[1, 0],
			[0, 1],
		]) {
			const n = board.get(key(cell.x + dx, cell.y + dy));
			if (!present(n)) continue;
			links.push({
				ax: cell.x,
				ay: cell.y,
				bx: n.x,
				by: n.y,
				kind: n.color === cell.color ? 'bridge' : 'notch',
			});
		}
	}
	return links;
}

/** The board one cycle on: every living cell moves by exactly one; a dead cell stays. */
export function nextBoard(board: Board): Board {
	const next: Board = new Map();
	for (const [k, cell] of board) {
		const {trend} = pressureOf(board, cell);
		let life = cell.life;
		if (trend === 'grow') life += 1;
		else if (trend === 'shrink') life -= 1;
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
		if (cell.owner !== owner || cell.planned === 'place' || cell.life === 0) continue;
		cells++;
		stake += cell.stake;
		colors.add(cell.color);
	}
	return {owner, cells, stake, colors: [...colors]};
}

export type Segment = {x1: number; y1: number; x2: number; y2: number};

/** The edges of each faction's connected living groups: one unit segment per open side. */
export function factionOutlines(board: Board): Map<number, Segment[]> {
	const out = new Map<number, Segment[]>();
	for (const cell of board.values()) {
		if (cell.life === 0 || cell.planned === 'place') continue;
		const segs = out.get(cell.color) ?? out.set(cell.color, []).get(cell.color)!;
		segs.push(...outlineOf(board, cell, (c) => c.color === cell.color && c.life > 0 && c.planned !== 'place'));
	}
	return out;
}

function outlineOf(board: Board, cell: Cell, same: (c: Cell) => boolean): Segment[] {
	const segments: Segment[] = [];
	const mine = (x: number, y: number) => {
		const c = board.get(key(x, y));
		return !!c && same(c);
	};
	const {x, y} = cell;
	if (!mine(x, y - 1)) segments.push({x1: x - 0.5, y1: y - 0.5, x2: x + 0.5, y2: y - 0.5});
	if (!mine(x + 1, y)) segments.push({x1: x + 0.5, y1: y - 0.5, x2: x + 0.5, y2: y + 0.5});
	if (!mine(x, y + 1)) segments.push({x1: x - 0.5, y1: y + 0.5, x2: x + 0.5, y2: y + 0.5});
	if (!mine(x - 1, y)) segments.push({x1: x - 0.5, y1: y - 0.5, x2: x - 0.5, y2: y + 0.5});
	return segments;
}

/** The edges of an owner's connected groups (round 1; dropped: unbounded players). */
export function ownerOutline(board: Board, owner: string): Segment[] {
	const segments: Segment[] = [];
	const mine = (x: number, y: number) => {
		const c = board.get(key(x, y));
		return !!c && c.owner === owner && c.planned !== 'place' && c.life > 0;
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
