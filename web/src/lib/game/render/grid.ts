/**
 * The infinite grid, as geometry rather than as drawing.
 *
 * Both hosts draw the same grid and they must agree TO THE PIXEL, or switching
 * renderer moves the board half a cell and every click looks misaligned. The
 * two draw it by different means (pixi slides one pre-built tile of lines; the
 * canvas-2d host strokes the visible lines each frame), so the only way for
 * them to agree by construction rather than by coincidence is for both to take
 * their line positions from here.
 *
 * Pure, in game units, and no rendering library in sight, so the agreement is
 * checked by a test rather than by eye.
 */
import {
	visibleCells,
	type ScreenSize,
	type ViewTransform,
} from './view-transform';
import type {ZoomLimits} from './view-transform';

/**
 * Cells are CENTRED on their integer coordinate: the cell at (3, 4) spans
 * 2.5..3.5. That is the convention `CellObject` draws with and the one clicks
 * are snapped to, so grid lines fall on half-integers.
 *
 * A grid that forgot this would be drawn exactly half a cell out of step with
 * every object on it, which reads as "the click detection is broken" rather
 * than as a grid problem.
 */
export const GRID_LINE_OFFSET = 0.5;

/** Where the grid lines fall, in game units, for what is currently visible. */
export function gridLines(
	transform: ViewTransform,
	screen: ScreenSize,
): {xs: number[]; ys: number[]} {
	const bounds = visibleCells(transform, screen);
	const xs: number[] = [];
	const ys: number[] = [];
	if (bounds.maxX < bounds.minX) return {xs, ys};
	for (let x = bounds.minX; x <= bounds.maxX; x++)
		xs.push(x - GRID_LINE_OFFSET);
	for (let y = bounds.minY; y <= bounds.maxY; y++)
		ys.push(y - GRID_LINE_OFFSET);
	return {xs, ys};
}

/**
 * The top-left corner of a pre-built grid tile, in game units, so that the tile
 * covers what is visible with its lines landing exactly on {@link gridLines}.
 *
 * For a host that builds the grid once and moves it (pixi), rather than
 * stroking it per frame.
 */
export function gridTileOrigin(
	transform: ViewTransform,
	screen: ScreenSize,
): {x: number; y: number} {
	const bounds = visibleCells(transform, screen);
	if (bounds.maxX < bounds.minX)
		return {x: -GRID_LINE_OFFSET, y: -GRID_LINE_OFFSET};
	return {
		x: bounds.minX - GRID_LINE_OFFSET,
		y: bounds.minY - GRID_LINE_OFFSET,
	};
}

/**
 * How many cells wide a pre-built grid tile has to be.
 *
 * DERIVED from the camera's zoom limits rather than picked by hand, because the
 * two have to move together: a tile smaller than the widest the camera can go
 * simply runs out at the edge of the screen, and it does so only at full zoom
 * out, which is exactly where nobody looks. Getting it from the same config the
 * camera is built from means raising the limit cannot leave a stale number
 * behind in a component.
 *
 * The margin covers the tile being snapped to whole cells and `visibleCells`
 * adding its own cell of slack at each edge.
 */
export function gridTileCells(limits: ZoomLimits): number {
	return Math.ceil(Math.max(limits.maxWidth, limits.maxHeight)) + 4;
}
