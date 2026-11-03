import {describe, expect, it} from 'vitest';
import {writable} from 'svelte/store';
import type {Frame, ViewStateStore, ViewStateValue} from '$lib/game/core/seams';
import {createImmediateBoardRenderer} from '$lib/placement/render/board-immediate';
import type {BoardView, CellView} from '$lib/placement/view';

/**
 * The board's immediate renderer, against a context that RECORDS rather than
 * paints.
 *
 * There is a browser test beside this one (`test/lib/game/render/
 * canvas2d.svelte.test.ts`) that reads real pixels back off a real canvas, and
 * it is the better test of everything this draws. This file exists for the one
 * thing pixels cannot see.
 *
 * CULLING IS INVISIBLE TO A PIXEL TEST. It is the only logic in this module
 * that is not a drawing call, and it changes no picture at all: canvas silently
 * discards a `fillRect` at a wildly out-of-range coordinate, so a board that
 * culls and a board that does not are byte-identical on screen. Removing the
 * culling was checked against the pixel suite and passed all six of its tests.
 *
 * What culling actually is, is WORK - and the amount of it is unbounded, since
 * the state store is scoped to the camera's ZONES and a zone is 16 cells wide,
 * so it legitimately hands over cells that are off screen. Work is countable,
 * which is why this counts calls.
 */

type Call = {op: string; args: number[]};

/**
 * Enough of `CanvasRenderingContext2D` for this renderer, recording what it is
 * asked to draw.
 *
 * Deliberately NOT a mock of the whole interface: the renderer is handed the
 * context by the host, so anything it calls that is missing here shows up as a
 * TypeError in the test rather than being silently absorbed - which is the
 * failure mode of a permissive stub, and the reason the pixel test exists at
 * all.
 */
function recordingContext() {
	const calls: Call[] = [];
	const context = {
		globalAlpha: 1,
		fillStyle: '',
		strokeStyle: '',
		lineWidth: 0,
		fillRect: (...args: number[]) => calls.push({op: 'fillRect', args}),
		strokeRect: (...args: number[]) => calls.push({op: 'strokeRect', args}),
	};
	return {context: context as unknown as CanvasRenderingContext2D, calls};
}

const frame: Frame = {
	timeMs: 0,
	deltaMs: 16,
	// 200x200 CSS pixels at 10 pixels per unit, centred on the origin: the
	// visible range is -10..10 in both axes, plus `visibleCells`' one-unit
	// margin.
	transform: {centerX: 0, centerY: 0, scale: 10},
	screen: {width: 200, height: 200},
	devicePixelRatio: 1,
};

function cell(x: number, y: number, over: Partial<CellView> = {}): CellView {
	const id = BigInt(x) * 1_000_000n + BigInt(y);
	return {
		cellID: id,
		totalStake: 0n,
		numClaimants: 0,
		position: {x, y},
		planned: false,
		...over,
	};
}

function setup(cells: CellView[]) {
	const store = writable<ViewStateValue<BoardView>>({
		step: 'Loaded',
		cycleNumber: 1,
		cells: new Map(cells.map((c) => [c.cellID, c])),
	});
	const viewState: ViewStateStore<BoardView> = {
		subscribe: store.subscribe,
		status: writable({loading: false}),
	};
	const {context, calls} = recordingContext();
	const renderer = createImmediateBoardRenderer({viewState});
	renderer.onAppStarted(context);
	return {store, renderer, calls};
}

describe('the board drawn in immediate mode', () => {
	it('draws nothing for a cell outside the camera', () => {
		const {renderer, calls} = setup([
			cell(0, 0, {numClaimants: 1}),
			cell(2, 1, {planned: true}),
			cell(400, 400, {numClaimants: 3, planned: true}),
			cell(-400, 0, {numClaimants: 3}),
			cell(0, 400, {planned: true}),
		]);

		renderer.tick(frame);

		// Only the cells at the origin were drawn, and every recorded call is at
		// a coordinate the camera can see. Asserting on the ARGUMENTS rather than
		// only on the count is what stops this passing if culling were replaced
		// by drawing the wrong cells.
		for (const call of calls) {
			expect(Math.abs(call.args[0])).toBeLessThanOrEqual(11);
			expect(Math.abs(call.args[1])).toBeLessThanOrEqual(11);
		}
		// One fill (the claimed cell) and one stroke (the planned one). Three of
		// the five cells are off screen; without culling this is five.
		expect(calls.filter((c) => c.op === 'fillRect')).toHaveLength(1);
		expect(calls.filter((c) => c.op === 'strokeRect')).toHaveLength(1);
	});

	/**
	 * The culling budget is the CAMERA's, not a constant. A renderer that culled
	 * against a hardcoded range would pass the test above and then clip the board
	 * at the screen edge the moment anybody zoomed out, which is exactly where
	 * nobody looks.
	 */
	it('culls against the camera it is given, not a fixed box', () => {
		const cells = [
			cell(0, 0, {numClaimants: 1}),
			cell(50, 0, {numClaimants: 1}),
		];
		const {renderer, calls} = setup(cells);

		renderer.tick(frame);
		expect(calls.filter((c) => c.op === 'fillRect')).toHaveLength(1);

		// Zoom out far enough to see the far cell: it must now be drawn.
		calls.length = 0;
		renderer.tick({...frame, transform: {centerX: 0, centerY: 0, scale: 1}});
		expect(calls.filter((c) => c.op === 'fillRect')).toHaveLength(2);
	});

	/**
	 * The mark for intent is drawn for INTENT, and a cell that merely has stake
	 * on it must not get one. Stated as its own case because the obvious way to
	 * write the assertion above - count the calls - passes if every cell is
	 * outlined and the fixture happens to have planned them all.
	 */
	it('does not outline a cell nobody planned', () => {
		const {renderer, calls} = setup([
			cell(0, 0, {numClaimants: 2}),
			cell(3, 3, {numClaimants: 1}),
		]);
		renderer.tick(frame);
		expect(calls.map((c) => c.op)).toEqual(['fillRect', 'fillRect']);
	});

	/** And the converse: a planned cell with no stake gets only the outline. */
	it('does not fill a cell that is only planned', () => {
		const {renderer, calls} = setup([cell(0, 0, {planned: true})]);
		renderer.tick(frame);
		expect(calls.map((c) => c.op)).toEqual(['strokeRect']);
	});

	/**
	 * The Unloaded case is DELIVERED to the renderer rather than skipped (see
	 * `immediate.ts`), so this module is called with a view that has no cells on
	 * it at all, and has to survive that rather than merely draw nothing. An
	 * earlier version of this test set an EMPTY board instead, which is a
	 * different thing entirely and passes whether or not the guard is there.
	 */
	it('draws nothing, and does not fall over, before the state loads', () => {
		const {store, renderer, calls} = setup([cell(0, 0, {numClaimants: 1})]);
		store.set({step: 'Unloaded'});
		expect(() => renderer.tick(frame)).not.toThrow();
		expect(calls).toEqual([]);
	});

	it('draws nothing for a board that is loaded and empty', () => {
		const {renderer, calls} = setup([]);
		renderer.tick(frame);
		expect(calls).toEqual([]);
	});

	/**
	 * A cell with stake and a cell merely planned are two different marks, and a
	 * cell that is both gets both. Pinned here as well as in pixels because this
	 * is the rule a commit-reveal board exists to communicate: what is on chain,
	 * and what is only intended.
	 */
	it('marks stake and intent separately', () => {
		const {renderer, calls} = setup([
			cell(0, 0, {numClaimants: 2, planned: true}),
		]);
		renderer.tick(frame);
		expect(calls.map((c) => c.op)).toEqual(['fillRect', 'strokeRect']);
	});

	/**
	 * What the plan leads to is a third mark, drawn only once the sandbox has
	 * answered for the plan (`next`), and drawn smaller than a confirmed fill so
	 * the two are never confused.
	 */
	it('shows what a planned cell will hold once the preview answers', () => {
		const next = {totalStake: 2n, numClaimants: 2, playerStake: 1n};
		const {renderer, calls} = setup([
			cell(0, 0, {numClaimants: 1, planned: true, next}),
		]);
		renderer.tick(frame);
		expect(calls.map((c) => c.op)).toEqual([
			'fillRect',
			'fillRect',
			'strokeRect',
		]);
		const [confirmed, preview] = calls;
		expect(preview.args[2]).toBeLessThan(confirmed.args[2]);
	});

	it('stops drawing once the host has stopped', () => {
		const {renderer, calls} = setup([cell(0, 0, {numClaimants: 1})]);
		renderer.onAppStopped();
		renderer.tick(frame);
		expect(calls).toEqual([]);
	});
});
