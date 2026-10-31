/**
 * Applying the camera to a pixi scene, and the infinite grid.
 *
 * This is job three of the three `pixi-viewport` used to do (recognise
 * gestures, hold the transform, apply it when drawing), and the only one that
 * is actually pixi's. It is about ten lines, which is the whole argument for
 * having replaced the library rather than wrapping it.
 *
 * The unit change happens here and nowhere else. Pixi content is authored in
 * PIXELS AT 1:1 (`CellObject` places itself at `position.x * cellSize`), while
 * the camera is in game units, so `cellSize` is exactly the conversion factor
 * between the two and appears in this file alone.
 */
import {Graphics, type Container} from 'pixi.js';
import {gridTileOrigin} from '../grid';
import type {ScreenSize, ViewTransform} from '../view-transform';

/**
 * Position and scale the world container so that the camera's centre lands in
 * the middle of the surface.
 */
export function applyTransform(params: {
	world: Container;
	transform: ViewTransform;
	screen: ScreenSize;
	cellSize: number;
}): void {
	const {world, transform, screen, cellSize} = params;
	world.scale.set(transform.scale / cellSize);
	world.position.set(
		screen.width / 2 - transform.centerX * transform.scale,
		screen.height / 2 - transform.centerY * transform.scale,
	);
}

/**
 * One tile of grid lines, in content pixels.
 *
 * `cells` should cover the largest area the camera may ever show, plus a
 * margin, so that {@link positionGrid} can slide the same tile around forever
 * instead of anything being rebuilt as the player moves.
 */
export function buildGrid(cells: number, cellSize: number): Graphics {
	const graphics = new Graphics();
	const size = cells * cellSize;
	for (let i = 0; i <= cells; i++) {
		graphics.moveTo(i * cellSize, 0).lineTo(i * cellSize, size);
		graphics.moveTo(0, i * cellSize).lineTo(size, i * cellSize);
	}
	return graphics.stroke({color: 0xffffff, pixelLine: true, width: 1});
}

/**
 * Where to put the grid tile, in CONTENT PIXELS.
 *
 * Only the unit conversion: where the lines actually go is `grid.ts`, shared
 * with the canvas-2d host so the two cannot drift apart. A test pins that they
 * agree, because a disagreement shows up as the board sitting half a cell off
 * its own grid, which reads as broken click detection rather than as a grid
 * problem.
 *
 * The previous version used a modulo of the viewport's own transform. Same
 * effect, but expressed in terms of `viewport.x / viewport.scaled`, so it could
 * only be understood by someone who knew what pixi-viewport kept in those
 * fields.
 */
export function positionGrid(params: {
	transform: ViewTransform;
	screen: ScreenSize;
	cellSize: number;
}): {x: number; y: number} {
	const {transform, screen, cellSize} = params;
	const origin = gridTileOrigin(transform, screen);
	return {x: origin.x * cellSize, y: origin.y * cellSize};
}
