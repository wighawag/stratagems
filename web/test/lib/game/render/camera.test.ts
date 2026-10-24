import {describe, expect, it} from 'vitest';
import {get} from 'svelte/store';
import {createCamera, type Camera} from '$lib/game/render/camera';

const config = {
	initialVisible: {width: 24, height: 24},
	limits: {minWidth: 10, minHeight: 10, maxWidth: 100, maxHeight: 100},
};

describe('createCamera', () => {
	/**
	 * A canvas commonly reports 0x0 on its first layout pass and its real size a
	 * frame later. Fitting on "the first resize" therefore fits to nothing, and
	 * the game opens at an arbitrary zoom that the player has to correct by hand
	 * every time they load the page.
	 */
	it('fits on the first resize that has a real size, not the first resize', () => {
		const {cameraControl} = createCamera(config);
		cameraControl.resize(0, 0);
		expect(cameraControl.current.transform.scale).toBe(1);

		cameraControl.resize(800, 600);
		// 24 units into 600px of height is the tighter fit.
		expect(cameraControl.current.transform.scale).toBe(25);
	});

	it('does not re-fit on later resizes', () => {
		const {cameraControl} = createCamera(config);
		cameraControl.resize(800, 600);
		cameraControl.handle({type: 'zoom', factor: 2, anchor: {x: 400, y: 300}});
		const zoomed = cameraControl.current.transform.scale;
		cameraControl.resize(900, 600);
		expect(cameraControl.current.transform.scale).toBe(zoomed);
	});

	/**
	 * The limits are phrased as visible world extent, so shrinking the window
	 * changes what they permit. A camera that only clamped on zoom would sit
	 * outside its own limits after a resize.
	 */
	it('re-clamps the scale when a resize makes the current zoom illegal', () => {
		const {cameraControl} = createCamera(config);
		cameraControl.resize(800, 600);
		cameraControl.setScale(60); // the ceiling at this size: 10 units across 600px
		cameraControl.resize(200, 150);
		// 10 units across 150px of height is now the ceiling.
		expect(cameraControl.current.transform.scale).toBe(15);
	});

	/**
	 * The camera is authoritative, so it works before anything is mounted. The
	 * version that delegated to the surface silently dropped this, and the
	 * symptom was a "jump to my move" button that did nothing on a cold load.
	 */
	it('can be moved before any surface exists', () => {
		const {cameraControl} = createCamera(config);
		cameraControl.follow(12, -4);
		expect(cameraControl.current.transform.centerX).toBe(12);
		expect(cameraControl.current.transform.centerY).toBe(-4);

		cameraControl.move(3, 1);
		expect(cameraControl.current.transform.centerX).toBe(15);
		expect(cameraControl.current.transform.centerY).toBe(-3);
	});

	it('publishes the camera the state layer reads, in game units', () => {
		const {camera, cameraControl} = createCamera(config);
		cameraControl.resize(800, 600);
		cameraControl.follow(2, 3);
		expect(get(camera)).toEqual({x: 2, y: 3, width: 32, height: 24});
	});

	it('publishes a new extent on resize even when the transform is unchanged', () => {
		const {camera, cameraControl} = createCamera(config);
		cameraControl.resize(800, 600);
		const seen: Camera[] = [];
		const unsubscribe = camera.subscribe(($camera) => seen.push($camera));
		// Wider, same height, so the fit and the clamp both leave the scale alone.
		cameraControl.resize(1000, 600);
		unsubscribe();
		expect(seen.at(-1)!.width).toBe(40);
		expect(seen.at(-1)!.height).toBe(24);
	});

	it('does not publish when nothing changed', () => {
		const {camera, cameraControl} = createCamera(config);
		cameraControl.resize(800, 600);
		let updates = 0;
		const unsubscribe = camera.subscribe(() => updates++);
		updates = 0; // discard the subscription's initial call
		cameraControl.resize(800, 600);
		cameraControl.follow(0, 0);
		unsubscribe();
		expect(updates).toBe(0);
	});

	describe('gestures', () => {
		it('pans in game units, accounting for zoom', () => {
			const {cameraControl} = createCamera(config);
			cameraControl.resize(800, 600); // scale 25
			cameraControl.handle({type: 'pan', dx: 50, dy: -25});
			expect(cameraControl.current.transform.centerX).toBe(-2);
			expect(cameraControl.current.transform.centerY).toBe(1);
		});

		it('zooms about the anchor and respects the limits', () => {
			const {cameraControl} = createCamera(config);
			cameraControl.resize(800, 600);
			const before = cameraControl.toWorld({x: 700, y: 100});
			cameraControl.handle({
				type: 'zoom',
				factor: 100,
				anchor: {x: 700, y: 100},
			});
			expect(cameraControl.current.transform.scale).toBe(60);
			const after = cameraControl.toWorld({x: 700, y: 100});
			expect(after.x).toBeCloseTo(before.x, 9);
			expect(after.y).toBeCloseTo(before.y, 9);
		});

		/**
		 * What a click MEANS is a game rule, so it goes to the game through the
		 * canvas event emitter and must never move the view. Feeding one in here
		 * has to be inert rather than, say, centring on it.
		 */
		it('ignores clicks', () => {
			const {cameraControl} = createCamera(config);
			cameraControl.resize(800, 600);
			const before = cameraControl.current.transform;
			cameraControl.handle({type: 'click', at: {x: 10, y: 10}});
			expect(cameraControl.current.transform).toBe(before);
		});
	});

	it('converts a surface point to game units', () => {
		const {cameraControl} = createCamera(config);
		cameraControl.resize(800, 600); // scale 25, centre 0,0
		expect(cameraControl.toWorld({x: 400, y: 300})).toEqual({x: 0, y: 0});
		expect(cameraControl.toWorld({x: 425, y: 300})).toEqual({x: 1, y: 0});
	});
});
