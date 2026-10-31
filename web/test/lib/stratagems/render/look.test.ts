import {describe, it, expect} from 'vitest';
import {
	BEZEL_PX,
	DIAL_PX,
	HOVER_GRACE_MS,
	cellKeyAt,
	gemColour,
	hoverStep,
	isGhost,
	isRemoval,
	isLit,
	linksOf,
	marksFilled,
	pendingMark,
	pulse,
	startsDying,
	stoneScale,
	zoomOf,
	type HoverState,
} from '$lib/stratagems/render/look';
import type {CellView} from '$lib/stratagems/view';
import {EVIL_OWNER_ADDRESS, xyToBigIntID} from 'stratagems-common';

const MAX = 7;
const ALICE = '0x00000000000000000000000000000000000a11ce' as const;
const BOB = '0x0000000000000000000000000000000000000b0b' as const;
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

function board(...cells: CellView[]): Map<string, CellView> {
	return new Map(cells.map((c) => [c.position.toString(), c]));
}

describe('the zoom classes', () => {
	it('shows the dial from 34 pixels an intersection, size below', () => {
		expect(DIAL_PX).toBe(34);
		expect(zoomOf(34).dial).toBe(true);
		expect(zoomOf(33.9).dial).toBe(false);
	});

	it('shows the bezel from 48 pixels, the ivory wash at every zoom', () => {
		expect(BEZEL_PX).toBe(48);
		expect(zoomOf(48).bezel).toBe(true);
		expect(zoomOf(47.9).bezel).toBe(false);
	});
});

describe('the stone, its marks and its pending mark', () => {
	it('is full size with the dial, and sized by life without it', () => {
		const near = zoomOf(100);
		const far = zoomOf(14);
		expect(stoneScale(cell(0, 0, {life: 1}), near, MAX)).toBe(1);
		const sizes = [1, 2, 3, 4, 5, 6, 7].map((life) =>
			stoneScale(cell(0, 0, {life}), far, MAX),
		);
		for (let i = 1; i < sizes.length; i++)
			expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
		expect(sizes[6]).toBe(1);
	});

	it('draws a dead husk smaller than a living gem, at every zoom', () => {
		for (const px of [14, 100]) {
			const zoom = zoomOf(px);
			expect(
				stoneScale(cell(0, 0, {life: 0, trend: 'dead'}), zoom, MAX),
			).toBeLessThan(
				stoneScale(cell(0, 0, {life: MAX, trend: 'full'}), zoom, MAX),
			);
		}
	});

	it('fills the marks of the life a shrinking gem keeps, and all of a growing one', () => {
		expect(marksFilled(cell(0, 0, {life: 3, trend: 'grow'}))).toBe(3);
		expect(marksFilled(cell(0, 0, {life: 3, trend: 'shrink'}))).toBe(2);
		expect(marksFilled(cell(0, 0, {life: 7, trend: 'full'}))).toBe(7);
		expect(marksFilled(cell(0, 0, {life: 0, trend: 'dead'}))).toBe(0);
	});

	it('pulses the mark life is coming to, or the one it is leaving', () => {
		expect(pendingMark(cell(0, 0, {life: 3, trend: 'grow'}), MAX)).toEqual({
			index: 3,
			kind: 'grow',
		});
		expect(pendingMark(cell(0, 0, {life: 3, trend: 'shrink'}), MAX)).toEqual({
			index: 2,
			kind: 'shrink',
		});
		expect(
			pendingMark(cell(0, 0, {life: 7, trend: 'full'}), MAX),
		).toBeUndefined();
		expect(
			pendingMark(cell(0, 0, {life: 0, trend: 'dead'}), MAX),
		).toBeUndefined();
		expect(
			pendingMark(cell(0, 0, {life: 3, trend: 'grow', planned: 1}), MAX),
		).toBeUndefined();
	});

	it('pulses every gem in step, between faint and full', () => {
		const values = Array.from({length: 200}, (_, i) => pulse(i * 10));
		expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
		expect(Math.max(...values)).toBeLessThanOrEqual(1);
		expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.9);
		expect(pulse(1234)).toBe(pulse(1234));
	});
});

describe('planned moves', () => {
	it('is a ghost when a colour is planned, a removal when none is', () => {
		expect(isGhost(cell(0, 0, {planned: 2}))).toBe(true);
		expect(isRemoval(cell(0, 0, {planned: 0}))).toBe(true);
		expect(isGhost(cell(0, 0, {planned: 0}))).toBe(false);
		expect(isGhost(cell(0, 0))).toBe(false);
		expect(isRemoval(cell(0, 0))).toBe(false);
	});
});

describe('bridges and notches', () => {
	it('bridges two same-colour neighbours and notches two of different colours, each pair once', () => {
		const links = linksOf(
			board(cell(0, 0), cell(1, 0), cell(0, 1, {color: 2}), cell(5, 5)),
		);
		expect(links).toHaveLength(2);
		expect(links).toContainEqual(
			expect.objectContaining({
				ax: 0,
				ay: 0,
				bx: 1,
				by: 0,
				kind: 'bridge',
				color: 1,
			}),
		);
		expect(links).toContainEqual(
			expect.objectContaining({ax: 0, ay: 0, bx: 0, by: 1, kind: 'notch'}),
		);
	});

	it('counts dead neighbours, which the contract counts too', () => {
		const links = linksOf(
			board(
				cell(0, 0),
				cell(1, 0, {life: 0, trend: 'dead'}),
				cell(-1, 0, {color: 2, life: 0, trend: 'dead'}),
			),
		);
		expect(links.map((l) => l.kind).sort()).toEqual(['bridge', 'notch']);
	});

	it('marks a link to a planned placement as planned', () => {
		const [link] = linksOf(board(cell(0, 0), cell(1, 0, {planned: 1})));
		expect(link).toMatchObject({kind: 'bridge', planned: true});
	});

	it('ignores empty cells (a removed cell, colour none)', () => {
		expect(
			linksOf(
				board(cell(0, 0), cell(1, 0, {color: 0, life: 0, trend: 'dead'})),
			),
		).toEqual([]);
	});
});

describe('the gems colours', () => {
	it('keeps each faction a distinct, deeper jewel tone, and Evil charcoal', () => {
		const tones = [1, 2, 3, 4, 5].map(gemColour);
		expect(new Set(tones).size).toBe(5);
		for (const tone of tones) expect(tone).toMatch(/^#[0-9a-f]{6}$/);
		expect(gemColour(6)).toBe('#2a2a2a');
	});
});

describe('the dying gem', () => {
	it('starts dying when a living gem is found dead, never when it was already', () => {
		expect(
			startsDying(
				cell(0, 0, {life: 1, trend: 'shrink'}),
				cell(0, 0, {life: 0, trend: 'dead'}),
			),
		).toBe(true);
		expect(
			startsDying(
				cell(0, 0, {life: 0, trend: 'dead'}),
				cell(0, 0, {life: 0, trend: 'dead'}),
			),
		).toBe(false);
		expect(
			startsDying(
				cell(0, 0, {life: 2, trend: 'shrink'}),
				cell(0, 0, {life: 1, trend: 'shrink'}),
			),
		).toBe(false);
	});

	it('does not die when the cell changes hands (a placement on a dead cell is new life)', () => {
		expect(
			startsDying(
				cell(0, 0, {life: 1, color: 1}),
				cell(0, 0, {life: 0, color: 0}),
			),
		).toBe(false);
	});
});

describe('ownership', () => {
	it('lights the focused owner and, for Evil, every Evil gem', () => {
		expect(isLit(cell(0, 0, {owner: ALICE}), ALICE)).toBe(true);
		expect(isLit(cell(0, 0, {owner: BOB}), ALICE)).toBe(false);
		expect(isLit(cell(0, 0, {owner: EVIL, color: 6}), EVIL)).toBe(true);
	});

	it('finds the cell under a point by its whole square, with no gap between neighbours', () => {
		expect(cellKeyAt({x: 0.49, y: -0.49})).toBe(xyToBigIntID(0, 0).toString());
		expect(cellKeyAt({x: 0.51, y: 0})).toBe(xyToBigIntID(1, 0).toString());
		expect(cellKeyAt({x: -1.4, y: 2.6})).toBe(xyToBigIntID(-1, 3).toString());
	});
});

describe('hovering without flicker', () => {
	const idle: HoverState = {};

	it('focuses the gem entered, at once', () => {
		expect(hoverStep(idle, {type: 'enter', key: 'a', at: 0})).toEqual({
			key: 'a',
		});
	});

	it('keeps the focus a moment after leaving to empty board, then lets go', () => {
		const left = hoverStep({key: 'a'}, {type: 'leave', at: 100});
		expect(left).toEqual({key: 'a', leftAt: 100});
		expect(hoverStep(left, {type: 'tick', at: 100 + HOVER_GRACE_MS - 1})).toBe(
			left,
		);
		expect(hoverStep(left, {type: 'tick', at: 100 + HOVER_GRACE_MS})).toEqual(
			{},
		);
	});

	it('moves straight to the next gem without letting go in between', () => {
		const left = hoverStep({key: 'a'}, {type: 'leave', at: 100});
		expect(hoverStep(left, {type: 'enter', key: 'b', at: 150})).toEqual({
			key: 'b',
		});
	});

	it('keeps the same state object when nothing changes, so a store does not fire', () => {
		const on = {key: 'a'};
		expect(hoverStep(on, {type: 'enter', key: 'a', at: 5})).toBe(on);
		expect(hoverStep(idle, {type: 'leave', at: 5})).toBe(idle);
		expect(hoverStep(on, {type: 'tick', at: 5})).toBe(on);
	});
});
