/**
 * Canvas-2d drawing helpers.
 *
 * The template's SECOND renderer exists to keep the render seam honest. A seam
 * with one implementation is a guess, and this is the cheapest possible way to
 * have two: no dependency, no shader, and it still exercises everything a twgl
 * or three.js renderer would (a per-frame draw, the camera transform, the
 * device pixel ratio, the view-state snapshot).
 *
 * Unlike the pixi host, an immediate renderer draws in GAME UNITS: there is no
 * scene graph authored in pixels, so there is no reason to convert. One
 * consequence to keep in mind, because it produces hairlines that vanish at low
 * zoom and slabs at high zoom: after {@link applyCamera} the context's
 * `lineWidth` is in game units too, so a line meant to be one pixel wide is
 * `1 / transform.scale`.
 */
import {gridLines} from '../grid';
import type {ScreenSize, ViewTransform} from '../view-transform';

/**
 * Reset the context, scale it for the device, and clear it.
 *
 * Called before anything is drawn. `setTransform` rather than `save`/`restore`
 * because a renderer that throws mid-frame otherwise leaves the stack
 * unbalanced and every subsequent frame drifts, which looks like a physics bug
 * and is not one.
 */
export function beginFrame(params: {
	context: CanvasRenderingContext2D;
	screen: ScreenSize;
	devicePixelRatio: number;
	background?: string;
}): void {
	const {context, screen, devicePixelRatio, background} = params;
	context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
	if (background) {
		context.fillStyle = background;
		context.fillRect(0, 0, screen.width, screen.height);
	} else {
		context.clearRect(0, 0, screen.width, screen.height);
	}
}

/**
 * Map game units onto the surface: after this, draw at world coordinates.
 *
 * Composed on top of whatever {@link beginFrame} set, so the device pixel ratio
 * still applies.
 */
export function applyCamera(params: {
	context: CanvasRenderingContext2D;
	transform: ViewTransform;
	screen: ScreenSize;
}): void {
	const {context, transform, screen} = params;
	context.translate(screen.width / 2, screen.height / 2);
	context.scale(transform.scale, transform.scale);
	context.translate(-transform.centerX, -transform.centerY);
}

/**
 * The same infinite grid a scene-graph host draws, in the same place.
 *
 * Every host must agree to the pixel, or switching renderer silently moves the
 * board half a cell. They agree by CONSTRUCTION rather than by coincidence:
 * they all take their line positions from `grid.ts`, and `grid.test.ts` pins
 * that the pre-built tile a retained host slides around (`gridTileOrigin`)
 * lands on the same lines this strokes (`gridLines`).
 *
 * That test is the reason `gridTileOrigin` stays here with no caller on this
 * branch: it is the half of the agreement that `with/pixi-js` consumes, and it
 * is the same case as `stateful.ts` and `reconcile.ts`. Deleting it as unused
 * would silently remove one side of the only thing that keeps two hosts drawing
 * the same board.
 */
export function drawGrid(params: {
	context: CanvasRenderingContext2D;
	transform: ViewTransform;
	screen: ScreenSize;
	color?: string;
	alpha?: number;
}): void {
	const {context, transform, screen} = params;
	const {xs, ys} = gridLines(transform, screen);
	if (xs.length === 0 || ys.length === 0) return;

	const first = {x: xs[0], y: ys[0]};
	const last = {x: xs[xs.length - 1], y: ys[ys.length - 1]};

	context.save();
	context.globalAlpha = params.alpha ?? 0.15;
	context.strokeStyle = params.color ?? '#ffffff';
	// In game units, because the camera transform is applied: a one-pixel line is
	// one pixel divided by the scale.
	context.lineWidth = 1 / transform.scale;
	context.beginPath();
	for (const x of xs) {
		context.moveTo(x, first.y);
		context.lineTo(x, last.y);
	}
	for (const y of ys) {
		context.moveTo(first.x, y);
		context.lineTo(last.x, y);
	}
	context.stroke();
	context.restore();
}
