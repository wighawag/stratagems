/**
 * The view transform: what part of the world is on screen, and how big.
 *
 * Pure arithmetic. No DOM, no renderer, no stores. This is the half of
 * `pixi-viewport` that was worth keeping, extracted so it can be tested without
 * a GPU and reused by any surface (pixi, canvas 2d, raw WebGL).
 *
 * `ViewTransform` and `ScreenSize` are declared in `game/core/seams` because
 * they are part of the render contract; this file is the arithmetic over them,
 * so the dependency runs render -> core and never back.
 *
 * Two conventions run through every function here, and getting them confused is
 * the only way to be wrong in this file:
 *
 * - a WORLD unit is a GAME unit (a cell), not a pixel. The `Camera` the state
 *   layer reads is in game units, so keeping the transform in the same unit
 *   means the camera falls out of it with no conversion and no `cellSize`
 *   sprinkled through the maths. A surface that authors its content in pixels
 *   converts once, where it applies the transform, and nowhere else.
 * - `scale` is CSS PIXELS PER WORLD UNIT, and `ScreenSize` is in CSS pixels.
 *   Device pixel ratio is the surface's business: it scales its own backing
 *   store and leaves this alone.
 */
import type {ScreenSize, ViewTransform} from '$lib/game/core/seams';

export type {ScreenSize, ViewTransform};

export type Point = {x: number; y: number};

/**
 * Zoom limits, expressed as the smallest and largest slice of the WORLD that
 * may be visible.
 *
 * Phrased this way rather than as scale factors because that is what a game
 * actually means ("never show fewer than 10 cells, never more than 100") and
 * because it stays true when the window is resized or the display changes
 * density. `pixi-viewport.clampZoom` used the same phrasing; the numbers in
 * both games are written in it.
 */
export type ZoomLimits = {
	minWidth: number;
	minHeight: number;
	maxWidth: number;
	maxHeight: number;
};

/** How much world fits on screen at this transform. */
export function visibleWorldSize(
	transform: ViewTransform,
	screen: ScreenSize,
): {width: number; height: number} {
	if (transform.scale <= 0) return {width: 0, height: 0};
	return {
		width: screen.width / transform.scale,
		height: screen.height / transform.scale,
	};
}

/**
 * The camera, in game units: what the state layer subscribes to in order to
 * decide which zones to load.
 *
 * A degenerate screen (zero-sized, which is what a canvas reports before its
 * first layout) yields a zero-sized camera rather than NaN or Infinity. The
 * zone loader already treats a zero extent as "nothing to load yet", so the
 * pre-layout frame costs nothing instead of asking for every zone in the
 * universe.
 */
export function cameraOf(
	transform: ViewTransform,
	screen: ScreenSize,
): {x: number; y: number; width: number; height: number} {
	const size = visibleWorldSize(transform, screen);
	return {
		x: transform.centerX,
		y: transform.centerY,
		width: size.width,
		height: size.height,
	};
}

/**
 * Screen point (CSS pixels, relative to the surface's top-left) to world point.
 */
export function screenToWorld(
	transform: ViewTransform,
	screen: ScreenSize,
	point: Point,
): Point {
	return {
		x: transform.centerX + (point.x - screen.width / 2) / transform.scale,
		y: transform.centerY + (point.y - screen.height / 2) / transform.scale,
	};
}

/** The inverse of {@link screenToWorld}. */
export function worldToScreen(
	transform: ViewTransform,
	screen: ScreenSize,
	point: Point,
): Point {
	return {
		x: screen.width / 2 + (point.x - transform.centerX) * transform.scale,
		y: screen.height / 2 + (point.y - transform.centerY) * transform.scale,
	};
}

/**
 * The scale range the limits allow on this screen.
 *
 * Both axes constrain, so the tightest of the two wins on each end: showing at
 * most `maxWidth` AND at most `maxHeight` means the minimum scale is whichever
 * of the two is the larger scale.
 *
 * Limits can contradict each other on an extreme aspect ratio (a very wide, very
 * short window can be unable to satisfy `maxHeight` and `minWidth` at once). The
 * minimum wins there, because being too far OUT shows more world than intended,
 * while being too far IN can leave a game unplayable on a phone. That is why
 * `max` is floored at `min` rather than the two being returned as given.
 */
export function scaleLimits(
	screen: ScreenSize,
	limits: ZoomLimits,
): {min: number; max: number} {
	// Guard the pre-layout screen: no size means no meaningful limit.
	if (screen.width <= 0 || screen.height <= 0) {
		return {min: 0, max: Infinity};
	}
	const min = Math.max(
		screen.width / limits.maxWidth,
		screen.height / limits.maxHeight,
	);
	const max = Math.min(
		screen.width / limits.minWidth,
		screen.height / limits.minHeight,
	);
	return {min, max: Math.max(min, max)};
}

/** Bring a scale inside {@link scaleLimits}. */
export function clampScale(
	scale: number,
	screen: ScreenSize,
	limits: ZoomLimits,
): number {
	const {min, max} = scaleLimits(screen, limits);
	return Math.min(Math.max(scale, min), max);
}

/**
 * The scale at which a world area of `width` x `height` just fits on screen.
 *
 * `pixi-viewport.fit`, minus the centring, which is a separate concern here.
 */
export function fitScale(
	screen: ScreenSize,
	width: number,
	height: number,
): number {
	if (screen.width <= 0 || screen.height <= 0) return 1;
	if (width <= 0 || height <= 0) return 1;
	return Math.min(screen.width / width, screen.height / height);
}

/**
 * Zoom by `factor` while keeping the world point under `anchor` where it is.
 *
 * This is what makes wheel-zoom and pinch-zoom feel right: the thing under the
 * cursor or between the fingers must not slide away. Implemented by taking the
 * world point before the zoom and moving the centre so that the same world
 * point lands back under the same screen point after it.
 *
 * The anchor is respected only as far as the clamped scale allows: at a zoom
 * limit the factor is reduced to whatever was left, so the anchor stays exact
 * rather than the camera drifting on a scroll that could not zoom.
 */
export function zoomAbout(
	transform: ViewTransform,
	screen: ScreenSize,
	anchor: Point,
	factor: number,
	limits: ZoomLimits,
): ViewTransform {
	const scale = clampScale(transform.scale * factor, screen, limits);
	if (scale === transform.scale) return transform;

	const before = screenToWorld(transform, screen, anchor);
	const zoomed: ViewTransform = {...transform, scale};
	const after = screenToWorld(zoomed, screen, anchor);
	return {
		centerX: zoomed.centerX + (before.x - after.x),
		centerY: zoomed.centerY + (before.y - after.y),
		scale,
	};
}

/**
 * The world rectangle currently visible, in whole game units, plus a margin.
 *
 * What an immediate renderer culls against, and what both hosts derive their
 * grid from. Returns an EMPTY range (max < min) rather than a degenerate one
 * when there is no surface yet, so a `for` loop over it does nothing.
 */
export function visibleCells(
	transform: ViewTransform,
	screen: ScreenSize,
	margin = 1,
): {minX: number; maxX: number; minY: number; maxY: number} {
	if (transform.scale <= 0) return {minX: 0, maxX: -1, minY: 0, maxY: -1};
	const halfWidth = screen.width / transform.scale / 2;
	const halfHeight = screen.height / transform.scale / 2;
	return {
		minX: Math.floor(transform.centerX - halfWidth) - margin,
		maxX: Math.ceil(transform.centerX + halfWidth) + margin,
		minY: Math.floor(transform.centerY - halfHeight) - margin,
		maxY: Math.ceil(transform.centerY + halfHeight) + margin,
	};
}

/**
 * Pan by a screen-pixel delta, in the direction the CONTENT moves.
 *
 * Dragging right moves the content right, which means the camera moves left,
 * hence the subtraction. Taking pixels rather than world units is deliberate:
 * the gesture layer only ever knows pixels, and converting here means the
 * conversion happens once, next to the scale it depends on.
 */
export function panByScreen(
	transform: ViewTransform,
	dx: number,
	dy: number,
): ViewTransform {
	if (transform.scale <= 0) return transform;
	return {
		centerX: transform.centerX - dx / transform.scale,
		centerY: transform.centerY - dy / transform.scale,
		scale: transform.scale,
	};
}
