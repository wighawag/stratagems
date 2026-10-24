import {describe, expect, it} from 'vitest';
import {
	GRID_LINE_OFFSET,
	gridLines,
	gridTileCells,
	gridTileOrigin,
} from '$lib/game/render/grid';
import {
	screenToWorld,
	visibleCells,
	type ScreenSize,
	type ViewTransform,
} from '$lib/game/render/view-transform';

const screen: ScreenSize = {width: 800, height: 600};

/** A spread of positions, zooms and both signs, including non-integer centres. */
const transforms: ViewTransform[] = [
	{centerX: 0, centerY: 0, scale: 25},
	{centerX: 3.5, centerY: -7.25, scale: 12},
	{centerX: -40, centerY: 40, scale: 8},
	{centerX: 0.5, centerY: 0.5, scale: 60},
	{centerX: -0.5, centerY: -0.5, scale: 9.37},
];

describe('grid geometry', () => {
	/**
	 * THE invariant this change turns on. The pixi host builds one tile of lines
	 * and slides it; the canvas-2d host strokes the visible lines each frame. If
	 * they disagree, switching renderer moves the board half a cell relative to
	 * its own grid, and it reads as broken click detection rather than as a grid
	 * problem, so it would be looked for in the wrong place.
	 */
	it('puts the pixi tile on exactly the lines the canvas-2d host strokes', () => {
		for (const transform of transforms) {
			const lines = gridLines(transform, screen);
			const origin = gridTileOrigin(transform, screen);

			// The tile starts at the first line, and its lines are one cell apart,
			// so tile line k is origin + k.
			expect(origin.x).toBeCloseTo(lines.xs[0], 9);
			expect(origin.y).toBeCloseTo(lines.ys[0], 9);
			lines.xs.forEach((x, k) => expect(x).toBeCloseTo(origin.x + k, 9));
			lines.ys.forEach((y, k) => expect(y).toBeCloseTo(origin.y + k, 9));
		}
	});

	/**
	 * Cells are centred on their integer coordinate, so the line between cell 3
	 * and cell 4 is at 3.5. Getting this wrong is invisible on an empty board and
	 * obvious the moment anything is drawn on it.
	 */
	it('falls on half-integers, between cells rather than through them', () => {
		const {xs, ys} = gridLines({centerX: 0, centerY: 0, scale: 25}, screen);
		for (const x of xs)
			expect(Math.abs(x % 1)).toBeCloseTo(GRID_LINE_OFFSET, 9);
		for (const y of ys)
			expect(Math.abs(y % 1)).toBeCloseTo(GRID_LINE_OFFSET, 9);
	});

	it('covers the whole visible area at every transform', () => {
		for (const transform of transforms) {
			const {xs, ys} = gridLines(transform, screen);
			const topLeft = screenToWorld(transform, screen, {x: 0, y: 0});
			const bottomRight = screenToWorld(transform, screen, {
				x: screen.width,
				y: screen.height,
			});
			expect(xs[0]).toBeLessThanOrEqual(topLeft.x);
			expect(ys[0]).toBeLessThanOrEqual(topLeft.y);
			expect(xs[xs.length - 1]).toBeGreaterThanOrEqual(bottomRight.x);
			expect(ys[ys.length - 1]).toBeGreaterThanOrEqual(bottomRight.y);
		}
	});

	it('draws nothing before the surface has a size', () => {
		const empty = gridLines(
			{centerX: 0, centerY: 0, scale: 0},
			{width: 0, height: 0},
		);
		expect(empty).toEqual({xs: [], ys: []});
	});

	/**
	 * The tile is built once, so it must cover the widest the camera may ever go.
	 * Derived from the camera's own limits precisely so that raising the
	 * zoom-out limit cannot leave a stale number behind in a component.
	 */
	it('sizes the tile to cover the camera at full zoom out', () => {
		const limits = {
			minWidth: 10,
			minHeight: 10,
			maxWidth: 100,
			maxHeight: 100,
		};
		const cells = gridTileCells(limits);

		// At the most zoomed-out the limits allow, the tile still spans the view.
		const scale = Math.max(
			screen.width / limits.maxWidth,
			screen.height / limits.maxHeight,
		);
		const {xs, ys} = gridLines({centerX: 0, centerY: 0, scale}, screen);
		expect(xs.length).toBeLessThanOrEqual(cells + 1);
		expect(ys.length).toBeLessThanOrEqual(cells + 1);
	});

	it('grows with the zoom-out limit rather than being a fixed number', () => {
		const base = {minWidth: 10, minHeight: 10, maxWidth: 100, maxHeight: 100};
		expect(gridTileCells({...base, maxWidth: 400})).toBeGreaterThan(
			gridTileCells(base),
		);
	});
});

describe('visibleCells', () => {
	it('spans what is on screen, with a margin', () => {
		// scale 100 on an 800x600 surface shows 8 by 6 units, centred on the
		// origin: -4..4 and -3..3, plus one cell of margin each way.
		expect(visibleCells({centerX: 0, centerY: 0, scale: 100}, screen)).toEqual({
			minX: -5,
			maxX: 5,
			minY: -4,
			maxY: 4,
		});
	});

	it('returns an empty range, not a degenerate one, with no surface', () => {
		const bounds = visibleCells(
			{centerX: 0, centerY: 0, scale: 0},
			{width: 0, height: 0},
		);
		// A `for (let x = minX; x <= maxX; x++)` over this must not execute.
		expect(bounds.maxX).toBeLessThan(bounds.minX);
		expect(bounds.maxY).toBeLessThan(bounds.minY);
	});
});
