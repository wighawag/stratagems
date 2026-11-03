import {describe, it, expect} from 'vitest';
import {surfaceOptions} from '$lib/game/render/pixi/surface';

describe('the pixi surface options', () => {
	it('defaults to pixel art: one pixel per CSS pixel, no smoothing', () => {
		expect(surfaceOptions({smooth: false, devicePixelRatio: 2})).toEqual({
			resolution: 1,
			antialias: false,
			roundPixels: true,
			imageRendering: 'pixelated',
		});
	});

	it('draws smooth art at the device ratio, antialiased, unrounded', () => {
		expect(surfaceOptions({smooth: true, devicePixelRatio: 2})).toEqual({
			resolution: 2,
			antialias: true,
			roundPixels: false,
			imageRendering: 'auto',
		});
	});

	it('falls back to a ratio of 1 when the browser reports none', () => {
		expect(surfaceOptions({smooth: true, devicePixelRatio: 0}).resolution).toBe(
			1,
		);
	});

	/**
	 * `autoDensity` with the host's `resizeTo: canvas` locks the canvas at
	 * pixi's default 800 by 600: pixi writes the canvas's CSS size and then
	 * measures it. The CSS (`width: 100%`) is what sizes the canvas here, so
	 * the option must never be set, whichever art the game draws.
	 */
	it('never asks pixi for autoDensity', () => {
		for (const smooth of [true, false]) {
			expect(surfaceOptions({smooth, devicePixelRatio: 2})).not.toHaveProperty(
				'autoDensity',
			);
		}
	});
});
