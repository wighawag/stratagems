/**
 * The per-frame bookkeeping every host needs.
 *
 * Elapsed time, the delta since the last frame, and assembling the `Frame` from
 * the camera. None of it is about any rendering library, and the README tells
 * you to write a new host by copying an existing one, so leaving it in the
 * components guarantees it is copied. It had already drifted between the two
 * that exist: they disagreed about what `devicePixelRatio` meant.
 *
 * Deliberately NOT a loop: it does not call `requestAnimationFrame` and does
 * not own a ticker. Hosts differ in what drives them (pixi has its own ticker,
 * which must stay in charge so it renders after the scene is updated), so this
 * owns the arithmetic and the host owns the schedule.
 */
import type {Frame} from '$lib/game/core/seams';
import type {CameraControl} from './camera';

export type FrameLoop = {
	/** Advance by an explicit delta, for a ticker that reports one (pixi). */
	advance(deltaMs: number): Frame;
	/** Advance to an absolute timestamp, for `requestAnimationFrame`. */
	advanceTo(now: number): Frame;
};

export function createFrameLoop(params: {
	cameraControl: CameraControl;
	/**
	 * The backing store the host has actually configured, in pixels per CSS
	 * pixel. A function rather than a value because it can change while the app
	 * runs (a window moved to a second monitor).
	 */
	devicePixelRatio: () => number;
}): FrameLoop {
	const {cameraControl, devicePixelRatio} = params;

	let elapsedMs = 0;
	let previous: number | undefined;

	function frameFor(deltaMs: number): Frame {
		const {transform, screen} = cameraControl.current;
		elapsedMs += deltaMs;
		return {
			timeMs: elapsedMs,
			deltaMs,
			transform,
			screen,
			devicePixelRatio: devicePixelRatio(),
		};
	}

	return {
		advance(deltaMs: number) {
			return frameFor(deltaMs);
		},
		advanceTo(now: number) {
			// Zero on the first frame rather than the time since the page loaded,
			// which is what `now` is and which would hand a renderer a delta of
			// several seconds to animate across.
			const deltaMs = previous === undefined ? 0 : now - previous;
			previous = now;
			return frameFor(deltaMs);
		},
	};
}
