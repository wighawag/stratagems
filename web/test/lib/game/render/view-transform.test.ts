import {describe, expect, it} from 'vitest';
import {
	cameraOf,
	clampScale,
	fitScale,
	panByScreen,
	scaleLimits,
	screenToWorld,
	worldToScreen,
	zoomAbout,
	type ScreenSize,
	type ViewTransform,
	type ZoomLimits,
} from '$lib/game/render/view-transform';

const screen: ScreenSize = {width: 800, height: 600};
const limits: ZoomLimits = {
	minWidth: 10,
	minHeight: 10,
	maxWidth: 100,
	maxHeight: 100,
};

describe('screen and world', () => {
	it('round-trips a point through both conversions', () => {
		const transform: ViewTransform = {centerX: 3, centerY: -7, scale: 24};
		for (const point of [
			{x: 0, y: 0},
			{x: 800, y: 600},
			{x: 123.5, y: 456.25},
		]) {
			const world = screenToWorld(transform, screen, point);
			const back = worldToScreen(transform, screen, world);
			expect(back.x).toBeCloseTo(point.x, 9);
			expect(back.y).toBeCloseTo(point.y, 9);
		}
	});

	it('puts the camera centre at the middle of the surface', () => {
		const transform: ViewTransform = {centerX: 5, centerY: 5, scale: 10};
		expect(screenToWorld(transform, screen, {x: 400, y: 300})).toEqual({
			x: 5,
			y: 5,
		});
	});
});

describe('the camera the state layer reads', () => {
	it('reports the visible extent in game units', () => {
		const transform: ViewTransform = {centerX: 2, centerY: 3, scale: 20};
		expect(cameraOf(transform, screen)).toEqual({
			x: 2,
			y: 3,
			width: 40,
			height: 30,
		});
	});

	/**
	 * A canvas reports 0x0 before its first layout, and the zone loader treats a
	 * zero extent as "nothing to load yet". Producing NaN or Infinity here would
	 * instead ask the poller for an unbounded set of zones on the first frame,
	 * which is a real request to a real node.
	 */
	it('is zero-sized, not infinite, before the surface has a size', () => {
		const camera = cameraOf(
			{centerX: 0, centerY: 0, scale: 0},
			{width: 0, height: 0},
		);
		expect(camera).toEqual({x: 0, y: 0, width: 0, height: 0});
	});
});

describe('zoom limits', () => {
	it('derives the scale range from the visible world extent', () => {
		const {min, max} = scaleLimits(screen, limits);
		// Widest allowed: 100 units across 800px, but also 100 down 600px. The
		// tighter of the two wins, and here that is the width.
		expect(min).toBe(8);
		// Tightest allowed: 10 units across 800px is 80, 10 down 600px is 60.
		expect(max).toBe(60);
	});

	it('clamps a scale into range at both ends', () => {
		expect(clampScale(1, screen, limits)).toBe(8);
		expect(clampScale(1000, screen, limits)).toBe(60);
		expect(clampScale(30, screen, limits)).toBe(30);
	});

	/**
	 * An extreme aspect ratio can make the limits unsatisfiable: this window
	 * cannot show at most 20 units of height AND at least 10 units of width at
	 * once. The minimum wins, because being too far OUT shows more world than
	 * intended while being too far IN can leave the game unplayable.
	 */
	it('resolves contradictory limits towards the minimum', () => {
		const wide = {width: 2000, height: 100};
		const impossible = {
			minWidth: 10,
			minHeight: 10,
			maxWidth: 20,
			maxHeight: 20,
		};
		const result = scaleLimits(wide, impossible);
		expect(result.max).toBe(result.min);
		expect(clampScale(1000, wide, impossible)).toBe(result.min);
		expect(clampScale(0.001, wide, impossible)).toBe(result.min);
	});

	it('imposes no limit before the surface has a size', () => {
		const result = scaleLimits({width: 0, height: 0}, limits);
		expect(result).toEqual({min: 0, max: Infinity});
	});
});

describe('fitting', () => {
	it('picks the scale at which the requested area just fits', () => {
		// 24 units into 800x600: 33.3 across, 25 down. The smaller fits both.
		expect(fitScale(screen, 24, 24)).toBe(25);
	});

	it('survives a degenerate screen or area', () => {
		expect(fitScale({width: 0, height: 0}, 24, 24)).toBe(1);
		expect(fitScale(screen, 0, 0)).toBe(1);
	});
});

describe('zooming about an anchor', () => {
	/**
	 * The property that makes wheel and pinch zoom feel right: whatever is under
	 * the cursor stays under the cursor. Checked at a corner, not the centre,
	 * because the centre is the one anchor for which a wrong implementation
	 * still passes.
	 */
	it('keeps the world point under the anchor fixed', () => {
		const transform: ViewTransform = {centerX: 0, centerY: 0, scale: 20};
		const anchor = {x: 700, y: 100};
		const before = screenToWorld(transform, screen, anchor);

		for (const factor of [1.15, 0.5, 2, 1 / 1.15]) {
			const zoomed = zoomAbout(transform, screen, anchor, factor, limits);
			const after = screenToWorld(zoomed, screen, anchor);
			expect(after.x).toBeCloseTo(before.x, 9);
			expect(after.y).toBeCloseTo(before.y, 9);
		}
	});

	it('does not move the camera when the zoom is already at a limit', () => {
		const atMax: ViewTransform = {centerX: 1, centerY: 2, scale: 60};
		expect(zoomAbout(atMax, screen, {x: 0, y: 0}, 2, limits)).toBe(atMax);

		const atMin: ViewTransform = {centerX: 1, centerY: 2, scale: 8};
		expect(zoomAbout(atMin, screen, {x: 0, y: 0}, 0.5, limits)).toBe(atMin);
	});

	it('honours the anchor even when the factor is cut short by a limit', () => {
		const transform: ViewTransform = {centerX: 0, centerY: 0, scale: 40};
		const anchor = {x: 780, y: 20};
		const before = screenToWorld(transform, screen, anchor);
		// Asks for 4x, gets 1.5x (60 is the ceiling).
		const zoomed = zoomAbout(transform, screen, anchor, 4, limits);
		expect(zoomed.scale).toBe(60);
		const after = screenToWorld(zoomed, screen, anchor);
		expect(after.x).toBeCloseTo(before.x, 9);
		expect(after.y).toBeCloseTo(before.y, 9);
	});
});

describe('panning', () => {
	it('moves the camera opposite to the content, scaled to zoom', () => {
		const transform: ViewTransform = {centerX: 0, centerY: 0, scale: 20};
		// Dragging the content 20px right moves the camera one unit left.
		expect(panByScreen(transform, 20, 0)).toEqual({
			centerX: -1,
			centerY: 0,
			scale: 20,
		});
	});

	it('covers more ground per pixel when zoomed out', () => {
		const near = panByScreen({centerX: 0, centerY: 0, scale: 40}, 40, 0);
		const far = panByScreen({centerX: 0, centerY: 0, scale: 10}, 40, 0);
		expect(near.centerX).toBe(-1);
		expect(far.centerX).toBe(-4);
	});
});
