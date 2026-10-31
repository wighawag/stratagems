import {describe, it, expect} from 'vitest';
import {mergeBoardView, type CellView} from '$lib/stratagems/view';
import {
	ALICE,
	BOB,
	CAROL,
	MAX_LIFE,
	at,
	boardAfter,
	type Played,
} from './board';

const RED = 1;
const BLUE = 2;
const GREEN = 3;

function view(
	cycles: {cycle: number; moves: Played[]}[],
	atCycle: number,
	plan: {
		player?: `0x${string}`;
		planned?: {x: number; y: number; color: number}[];
	} = {},
) {
	return mergeBoardView({
		onchain: boardAfter(cycles, atCycle),
		local: {
			player: plan.player,
			planned: (plan.planned ?? []).map((m) => ({
				position: at(m.x, m.y),
				color: m.color,
			})),
		},
		cycleNumber: atCycle,
		maxLife: MAX_LIFE,
	});
}

function cell(
	board: {cells: Map<string, CellView>},
	x: number,
	y: number,
): CellView {
	const found = board.cells.get(at(x, y).toString());
	expect(found, `no cell at ${x},${y}`).toBeDefined();
	return found!;
}

describe('the trend of a cell, from the contract copy', () => {
	it('grows with no enemy at all', () => {
		const board = view(
			[{cycle: 1, moves: [{player: ALICE, x: 0, y: 0, color: RED}]}],
			1,
		);
		expect(cell(board, 0, 0)).toMatchObject({
			life: 2,
			trend: 'grow',
			friends: 0,
			enemies: 0,
		});
	});

	it('is full at the maximum life, and stays there', () => {
		const board = view(
			[{cycle: 1, moves: [{player: ALICE, x: 0, y: 0, color: RED}]}],
			20,
		);
		expect(cell(board, 0, 0)).toMatchObject({life: MAX_LIFE, trend: 'full'});
	});

	it('shrinks when enemies outnumber friends', () => {
		const board = view(
			[
				{
					cycle: 1,
					moves: [
						{player: ALICE, x: 0, y: 0, color: RED},
						{player: BOB, x: 1, y: 0, color: BLUE},
					],
				},
			],
			1,
		);
		expect(cell(board, 0, 0)).toMatchObject({
			trend: 'shrink',
			friends: 0,
			enemies: 1,
		});
		expect(cell(board, 1, 0)).toMatchObject({
			trend: 'shrink',
			friends: 0,
			enemies: 1,
		});
	});

	it('grows when friends outnumber enemies', () => {
		const board = view(
			[
				{
					cycle: 1,
					moves: [
						{player: ALICE, x: 0, y: 0, color: RED},
						{player: ALICE, x: 0, y: 1, color: RED},
						{player: CAROL, x: 0, y: -1, color: RED},
						{player: BOB, x: 1, y: 0, color: BLUE},
					],
				},
			],
			1,
		);
		// two friends (one of them another player's), one enemy
		expect(cell(board, 0, 0)).toMatchObject({
			trend: 'grow',
			friends: 2,
			enemies: 1,
		});
	});

	it('shrinks on a tie, since only more friends than enemies (or none) grows', () => {
		const board = view(
			[
				{
					cycle: 1,
					moves: [
						{player: ALICE, x: 0, y: 0, color: RED},
						{player: ALICE, x: 0, y: 1, color: RED},
						{player: BOB, x: 1, y: 0, color: BLUE},
					],
				},
			],
			1,
		);
		expect(cell(board, 0, 0)).toMatchObject({
			trend: 'shrink',
			friends: 1,
			enemies: 1,
		});
	});

	it('is dead at life 0, and the dead cell keeps its colour and keeps pressing', () => {
		const surrounded = [
			{player: ALICE, x: 0, y: 0, color: RED},
			{player: BOB, x: 1, y: 0, color: BLUE},
		];
		// both die after their two lives (2, then 1, then 0)
		const board = view(
			[
				{cycle: 1, moves: surrounded},
				{cycle: 5, moves: [{player: CAROL, x: 2, y: 0, color: GREEN}]},
			],
			5,
		);
		expect(cell(board, 1, 0)).toMatchObject({
			life: 0,
			color: BLUE,
			trend: 'dead',
		});
		// Carol's new cell has only the dead blue one beside it: an enemy still
		expect(cell(board, 2, 0)).toMatchObject({
			life: 2,
			trend: 'shrink',
			enemies: 1,
		});
	});

	it('takes planned moves into account, as the contract would apply them', () => {
		const cycles = [
			{cycle: 1, moves: [{player: ALICE, x: 0, y: 0, color: RED}]},
		];
		expect(cell(view(cycles, 2), 0, 0).trend).toBe('grow');
		const planned = view(cycles, 2, {
			player: BOB,
			planned: [{x: 1, y: 0, color: BLUE}],
		});
		expect(cell(planned, 0, 0)).toMatchObject({trend: 'shrink', enemies: 1});
		expect(cell(planned, 1, 0)).toMatchObject({planned: BLUE, trend: 'shrink'});
	});
});

describe('who made an Evil cell, while the indexer still knows', () => {
	const DAVE = '0x00000000000000000000000000000000000da7e0' as const;

	function evilBoard(placementsKnown: boolean) {
		// a collision: Alice red and Bob blue on the same cell in one cycle
		const onchain = boardAfter(
			[
				{
					cycle: 1,
					moves: [
						{player: ALICE, x: 0, y: 0, color: RED},
						{player: BOB, x: 0, y: 0, color: BLUE},
					],
				},
			],
			1,
		);
		if (placementsKnown) {
			onchain.data.placements = [
				{
					cycle: 2,
					cells: {
						[at(5, 5).toString()]: {players: [{color: RED, address: DAVE}]},
					},
				},
				{
					cycle: 1,
					cells: {
						[at(0, 0).toString()]: {
							players: [
								{color: RED, address: ALICE},
								{color: BLUE, address: BOB},
							],
						},
					},
				},
			];
		}
		return mergeBoardView({
			onchain,
			local: {planned: []},
			cycleNumber: 1,
			maxLife: MAX_LIFE,
		});
	}

	it('is a collision, one gem per player', () => {
		expect(cell(evilBoard(false), 0, 0)).toMatchObject({
			color: 6,
			stake: 2,
			life: 2,
		});
	});

	it('names the players from the placement window', () => {
		expect(cell(evilBoard(true), 0, 0).makers).toEqual([ALICE, BOB]);
	});

	it('names nobody once the window has moved on', () => {
		expect(cell(evilBoard(false), 0, 0).makers).toBeUndefined();
	});
});
