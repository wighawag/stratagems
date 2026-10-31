/**
 * The card at the top right (step 9, P9-5 and P9-6): the gem the player hovers
 * or taps, described. A pure function from the view and the focused cell, so
 * the component lays it out and decides nothing.
 *
 * - A gem: its owner (a blockie and a short address), its life and trend with
 *   its friends and enemies, and what that owner holds (living cells, gems at
 *   stake, their colours).
 * - A dead cell: its colour and last owner; it is free to anyone and still
 *   counts for its neighbours.
 * - An Evil cell: its gems at stake, the players whose collision made it while
 *   the indexer still knows them (else "a collision of N players", one gem
 *   each), and who its death would pay: its enemies' owners.
 */
import {Color, EVIL_OWNER_ADDRESS, xyToBigIntID} from 'stratagems-common';
import type {BoardView, CellView, Trend} from '../view';

export type FocusCard =
	| {
			kind: 'owner';
			owner: `0x${string}` | undefined;
			you: boolean;
			life: number;
			maxLife: number;
			trend: Trend;
			trendLabel: string;
			friends: number;
			enemies: number;
			livingCells: number;
			gemsAtStake: number;
			colours: number[];
	  }
	| {kind: 'dead'; color: number; lastOwner: `0x${string}` | undefined}
	| {
			kind: 'evil';
			stake: number;
			life: number;
			maxLife: number;
			trend: Trend;
			trendLabel: string;
			makers: `0x${string}`[] | undefined;
			/** How many players collided: one gem each. */
			collision: number;
			/** Its enemies' owners, whom its death would pay. */
			paysTo: `0x${string}`[];
	  };

const TREND_LABEL: Record<Trend, string> = {
	grow: 'growing',
	shrink: 'shrinking',
	full: 'full',
	dead: 'dead',
};

const EVIL_OWNER = EVIL_OWNER_ADDRESS.toLowerCase();

const NEIGHBOURS = [
	[1, 0],
	[0, 1],
	[-1, 0],
	[0, -1],
] as const;

function holdings(view: BoardView, owner: string | undefined) {
	let livingCells = 0;
	let gemsAtStake = 0;
	const colours = new Set<number>();
	if (owner === undefined) return {livingCells, gemsAtStake, colours: []};
	for (const cell of view.cells.values()) {
		if (cell.owner !== owner || cell.life <= 0 || cell.color === Color.None) {
			continue;
		}
		livingCells++;
		gemsAtStake += cell.stake;
		colours.add(cell.color);
	}
	return {
		livingCells,
		gemsAtStake,
		colours: [...colours].sort((a, b) => a - b),
	};
}

function enemyOwners(view: BoardView, cell: CellView): `0x${string}`[] {
	const owners: `0x${string}`[] = [];
	for (const [dx, dy] of NEIGHBOURS) {
		const other = view.cells.get(
			xyToBigIntID(cell.x + dx, cell.y + dy).toString(),
		);
		if (!other || other.color === Color.None || other.color === cell.color)
			continue;
		const owner = other.owner;
		if (
			owner &&
			owner.toLowerCase() !== EVIL_OWNER &&
			!owners.includes(owner)
		) {
			owners.push(owner);
		}
	}
	return owners;
}

export function describeFocus(params: {
	view: BoardView;
	key: string | undefined;
	maxLife: number;
}): FocusCard | undefined {
	const {view, key, maxLife} = params;
	if (key === undefined) return undefined;
	const cell = view.cells.get(key);
	if (!cell || cell.color === Color.None) return undefined;
	if (cell.color === Color.Evil) {
		return {
			kind: 'evil',
			stake: cell.stake,
			life: cell.life,
			maxLife,
			trend: cell.trend,
			trendLabel: TREND_LABEL[cell.trend],
			makers: cell.makers,
			collision: cell.makers?.length ?? cell.stake,
			paysTo: enemyOwners(view, cell),
		};
	}
	if (cell.life <= 0) {
		return {kind: 'dead', color: cell.color, lastOwner: cell.owner};
	}
	return {
		kind: 'owner',
		owner: cell.owner,
		you: cell.mine,
		life: cell.life,
		maxLife,
		trend: cell.trend,
		trendLabel: TREND_LABEL[cell.trend],
		friends: cell.friends,
		enemies: cell.enemies,
		...holdings(view, cell.owner),
	};
}
