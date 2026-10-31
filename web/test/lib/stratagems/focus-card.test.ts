import {describe, it, expect} from 'vitest';
import {describeFocus} from '$lib/stratagems/hud/focus-card';
import type {BoardView, CellView} from '$lib/stratagems/view';
import {EVIL_OWNER_ADDRESS, xyToBigIntID} from 'stratagems-common';

const MAX = 7;
const ALICE = '0x00000000000000000000000000000000000a11ce' as const;
const BOB = '0x0000000000000000000000000000000000000b0b' as const;
const CAROL = '0x00000000000000000000000000000000000ca201' as const;
const EVIL = EVIL_OWNER_ADDRESS.toLowerCase() as `0x${string}`;

function cell(x: number, y: number, over: Partial<CellView> = {}): CellView {
	return {
		position: xyToBigIntID(x, y),
		x,
		y,
		color: 1,
		life: 3,
		stake: 1,
		trend: 'grow',
		friends: 0,
		enemies: 0,
		owner: ALICE,
		mine: false,
		...over,
	};
}

function view(...cells: CellView[]): BoardView {
	return {cells: new Map(cells.map((c) => [c.position.toString(), c]))};
}

const key = (x: number, y: number) => xyToBigIntID(x, y).toString();

describe('the card of the focused gem', () => {
	it('is nothing without a focus, or on an empty intersection', () => {
		expect(
			describeFocus({view: view(cell(0, 0)), key: undefined, maxLife: MAX}),
		).toBeUndefined();
		expect(
			describeFocus({view: view(cell(0, 0)), key: key(3, 3), maxLife: MAX}),
		).toBeUndefined();
	});

	it("gives the owner, the gem's life and trend, and what the owner holds", () => {
		const card = describeFocus({
			view: view(
				cell(0, 0, {life: 4, trend: 'shrink', friends: 1, enemies: 2}),
				cell(1, 0, {color: 2, stake: 1}),
				cell(5, 5, {life: 0, trend: 'dead'}),
				cell(6, 6, {owner: BOB}),
			),
			key: key(0, 0),
			maxLife: MAX,
		});
		expect(card).toEqual({
			kind: 'owner',
			owner: ALICE,
			you: false,
			life: 4,
			maxLife: MAX,
			trend: 'shrink',
			trendLabel: 'shrinking',
			friends: 1,
			enemies: 2,
			livingCells: 2,
			gemsAtStake: 2,
			colours: [1, 2],
		});
	});

	it('says yours on your own gem', () => {
		const card = describeFocus({
			view: view(cell(0, 0, {mine: true})),
			key: key(0, 0),
			maxLife: MAX,
		});
		expect(card).toMatchObject({kind: 'owner', you: true});
	});

	it('describes a dead cell as free to anyone, still counting for its neighbours', () => {
		const card = describeFocus({
			view: view(cell(0, 0, {life: 0, trend: 'dead', color: 3})),
			key: key(0, 0),
			maxLife: MAX,
		});
		expect(card).toEqual({kind: 'dead', color: 3, lastOwner: ALICE});
	});

	it("gives an Evil cell's gems, its makers, and who its death would pay", () => {
		const card = describeFocus({
			view: view(
				cell(0, 0, {
					color: 6,
					owner: EVIL,
					stake: 2,
					life: 2,
					trend: 'shrink',
					enemies: 2,
					makers: [ALICE, BOB],
				}),
				cell(1, 0, {owner: CAROL, color: 2}),
				cell(-1, 0, {owner: BOB, color: 1, life: 0, trend: 'dead'}),
				cell(0, 1, {owner: EVIL, color: 6}),
			),
			key: key(0, 0),
			maxLife: MAX,
		});
		expect(card).toEqual({
			kind: 'evil',
			stake: 2,
			life: 2,
			maxLife: MAX,
			trend: 'shrink',
			trendLabel: 'shrinking',
			makers: [ALICE, BOB],
			collision: 2,
			paysTo: [CAROL, BOB],
		});
	});

	it('says a collision of N players once the makers are forgotten', () => {
		const card = describeFocus({
			view: view(cell(0, 0, {color: 6, owner: EVIL, stake: 3})),
			key: key(0, 0),
			maxLife: MAX,
		});
		expect(card).toMatchObject({
			kind: 'evil',
			makers: undefined,
			collision: 3,
			paysTo: [],
		});
	});

	it('describes a planned placement as what it would be', () => {
		const card = describeFocus({
			view: view(cell(0, 0, {planned: 1, mine: true, life: 2})),
			key: key(0, 0),
			maxLife: MAX,
		});
		expect(card).toMatchObject({kind: 'owner', you: true, life: 2});
	});
});
