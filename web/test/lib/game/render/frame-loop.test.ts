import {describe, expect, it} from 'vitest';
import {createFrameLoop} from '$lib/game/render/frame-loop';
import type {CameraControl} from '$lib/game/render/camera';

/**
 * THE UNIT IS THE POINT.
 *
 * `Frame` carries `timeMs` and `deltaMs`, and the names are load-bearing
 * rather than tidy. When the field was called `delta`, a renderer passed it
 * straight into an animation that thought in SECONDS: every replay finished
 * inside one frame and read as a jump rather than a movement. Nothing caught
 * it, and nothing could - each side was correct and tested in its own units,
 * and the mismatch existed only where they met.
 *
 * A test cannot check a name. What it can check is that the numbers really are
 * milliseconds and really do accumulate, which is what makes the name true.
 */

const cameraControl = {
	current: {
		transform: {centerX: 0, centerY: 0, scale: 10},
		screen: {width: 100, height: 100},
	},
} as unknown as CameraControl;

function loop() {
	return createFrameLoop({cameraControl, devicePixelRatio: () => 2});
}

describe('createFrameLoop', () => {
	it('reports the first frame as zero elapsed, not as time since page load', () => {
		// `requestAnimationFrame` hands over a timestamp measured from page load,
		// so a loop that used it raw would give a renderer several SECONDS to
		// animate across on its very first frame.
		const frames = loop();
		const first = frames.advanceTo(12_345);
		expect(first.deltaMs).toBe(0);
		expect(first.timeMs).toBe(0);
	});

	it('measures the gap between absolute timestamps, in milliseconds', () => {
		const frames = loop();
		frames.advanceTo(1_000);
		const second = frames.advanceTo(1_016);
		// 16ms, one frame at 60Hz. Not 0.016, and not 1.
		expect(second.deltaMs).toBe(16);
		expect(second.timeMs).toBe(16);
	});

	it('accumulates elapsed time across frames', () => {
		const frames = loop();
		frames.advanceTo(0);
		frames.advanceTo(100);
		const third = frames.advanceTo(250);
		expect(third.deltaMs).toBe(150);
		expect(third.timeMs).toBe(250);
	});

	it('takes an explicit delta from a ticker that reports one', () => {
		// The pixi path: its ticker already knows the gap, and asking the clock
		// again would disagree with what pixi is about to render.
		const frames = loop();
		frames.advance(16);
		const second = frames.advance(16);
		expect(second.deltaMs).toBe(16);
		expect(second.timeMs).toBe(32);
	});

	it('carries the camera and the surface the host actually configured', () => {
		const frames = loop();
		const frame = frames.advance(16);
		expect(frame.transform).toEqual({centerX: 0, centerY: 0, scale: 10});
		expect(frame.screen).toEqual({width: 100, height: 100});
		// The buffer the host chose, which is not necessarily the window's: the
		// pixi host deliberately renders at CSS resolution.
		expect(frame.devicePixelRatio).toBe(2);
	});
});
