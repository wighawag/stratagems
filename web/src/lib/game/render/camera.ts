/**
 * The camera.
 *
 * Renderer-agnostic on purpose. The read side is what decides which part of the
 * world to load, so the state layer depends on it; if it imported pixi then
 * every game on this template would have to render with pixi.
 *
 * THE CAMERA IS AUTHORITATIVE. It holds the view transform, gestures are fed
 * into it, and the surface reads the transform back and applies it when it
 * draws. That is a reversal from the version of this file that delegated to
 * `pixi-viewport`, where the surface owned the transform and pushed the camera
 * up as a mirror of it. Two consequences worth knowing:
 *
 * - the camera works with no surface mounted. `follow()` before the canvas
 *   exists now moves the camera, where before it was silently dropped.
 * - there is one place the view can be changed from, so a game that wants to
 *   animate the camera, restore it from a URL or clamp it to a region has
 *   somewhere to do that.
 *
 * The `Camera` shape itself is unchanged, because it is what the zone loader
 * reads and it is in game units. See `view-transform.ts` for why everything
 * here is in game units and CSS pixels.
 */
import {writable, type Readable} from 'svelte/store';
import type {GestureIntent} from './gestures';
import {
	cameraOf,
	clampScale,
	fitScale,
	panByScreen,
	screenToWorld,
	zoomAbout,
	type Point,
	type ScreenSize,
	type ViewTransform,
	type ZoomLimits,
} from './view-transform';

/** Camera position and extent, in game units (not pixels). */
export type Camera = {
	x: number;
	y: number;
	width: number;
	height: number;
};

export type CameraWatcher = Readable<Camera>;

export type CameraConfig = {
	/**
	 * How much world to show on the first frame, in game units. Fitted to the
	 * surface once it reports a size, then clamped by `limits`.
	 */
	initialVisible: {width: number; height: number};
	limits: ZoomLimits;
	/** Where to look on the first frame, in game units. Defaults to the origin. */
	initialCenter?: Point;
};

export type CameraControl = {
	/**
	 * The surface's size in CSS pixels. Called on mount and from a
	 * ResizeObserver.
	 *
	 * Not optional to get right: every world/screen conversion and both zoom
	 * limits are relative to it, so a surface that never reports, or reports the
	 * window's size instead of its own, produces a camera that is subtly wrong
	 * everywhere. The previous canvas did exactly that by calling
	 * `pixi-viewport.resize()` with no arguments, and the visible symptom was the
	 * poller fetching zones that were never on screen.
	 */
	resize(width: number, height: number): void;
	/** Apply a gesture. Clicks are NOT gestures for the camera; see the host. */
	handle(intent: GestureIntent): void;
	/** Centre on a point, in game units. */
	follow(x: number, y: number): void;
	/** Shift the centre by a delta, in game units. */
	move(dx: number, dy: number): void;
	/** Set the scale directly, in CSS pixels per game unit. Clamped. */
	setScale(scale: number): void;
	/** Convert a surface-local point in CSS pixels to game units. */
	toWorld(point: Point): Point;
	/** What the surface applies when it draws. */
	transform: Readable<ViewTransform>;
	/** Current values, for a per-frame read that must not allocate a subscription. */
	readonly current: {transform: ViewTransform; screen: ScreenSize};
};

export function createCamera(config: CameraConfig): {
	camera: CameraWatcher;
	cameraControl: CameraControl;
} {
	const {initialVisible, limits} = config;

	let screen: ScreenSize = {width: 0, height: 0};
	let $transform: ViewTransform = {
		centerX: config.initialCenter?.x ?? 0,
		centerY: config.initialCenter?.y ?? 0,
		// A placeholder until the surface reports a size. Nothing is drawn before
		// then, and `resize` fits properly on the first real measurement.
		scale: 1,
	};

	/**
	 * Whether the initial fit still has to happen.
	 *
	 * A canvas commonly reports 0x0 for its first layout pass and its real size a
	 * frame later, so "the first resize" is not good enough: the fit has to wait
	 * for the first resize with a real size, or the game opens at an arbitrary
	 * zoom.
	 */
	let needsInitialFit = true;

	const transformStore = writable<ViewTransform>($transform);
	const cameraStore = writable<Camera>(cameraOf($transform, screen));

	function publish(next: ViewTransform) {
		if (
			next.centerX === $transform.centerX &&
			next.centerY === $transform.centerY &&
			next.scale === $transform.scale
		) {
			return;
		}
		$transform = next;
		transformStore.set($transform);
		publishCamera();
	}

	let $camera = cameraOf($transform, screen);
	function publishCamera() {
		const next = cameraOf($transform, screen);
		if (
			next.x === $camera.x &&
			next.y === $camera.y &&
			next.width === $camera.width &&
			next.height === $camera.height
		) {
			return;
		}
		$camera = next;
		cameraStore.set($camera);
	}

	const cameraControl: CameraControl = {
		resize(width: number, height: number) {
			if (width === screen.width && height === screen.height) return;
			screen = {width, height};

			if (needsInitialFit && width > 0 && height > 0) {
				needsInitialFit = false;
				publish({
					...$transform,
					scale: clampScale(
						fitScale(screen, initialVisible.width, initialVisible.height),
						screen,
						limits,
					),
				});
			} else {
				// Resizing changes what the limits permit (they are phrased as visible
				// world extent), so a window that shrinks can leave the current scale
				// out of range.
				publish({
					...$transform,
					scale: clampScale($transform.scale, screen, limits),
				});
			}
			// The extent changed even when the transform did not, and the extent is
			// what the zone loader reads.
			publishCamera();
		},

		handle(intent: GestureIntent) {
			switch (intent.type) {
				case 'pan':
					publish(panByScreen($transform, intent.dx, intent.dy));
					return;
				case 'zoom':
					publish(
						zoomAbout($transform, screen, intent.anchor, intent.factor, limits),
					);
					return;
				case 'click':
					// Deliberately ignored. What a click means is a game rule, so it goes
					// to the game through the canvas event emitter and never through
					// here. See `input.ts`.
					return;
			}
		},

		follow(x: number, y: number) {
			publish({...$transform, centerX: x, centerY: y});
		},

		move(dx: number, dy: number) {
			publish({
				...$transform,
				centerX: $transform.centerX + dx,
				centerY: $transform.centerY + dy,
			});
		},

		setScale(scale: number) {
			publish({...$transform, scale: clampScale(scale, screen, limits)});
		},

		toWorld(point: Point) {
			return screenToWorld($transform, screen, point);
		},

		transform: {subscribe: transformStore.subscribe},

		get current() {
			return {transform: $transform, screen};
		},
	};

	return {camera: {subscribe: cameraStore.subscribe}, cameraControl};
}
