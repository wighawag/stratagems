import {afterEach, describe, expect, it} from 'vitest';
import {createCamera} from '$lib/game/render/camera';
import {createCanvasEventEmitter} from '$lib/game/render/events';
import {connectSurfaceInput} from '$lib/game/render/input';

/**
 * The wiring every host shares, against a real element and real pointer events.
 *
 * In the browser project because that is the point: `attachGestures` uses
 * pointer capture, `getBoundingClientRect` and a `ResizeObserver`, none of which
 * a node environment has, and the coordinate conversion this checks is exactly
 * the one that was wrong in the previous canvas.
 */

const config = {
	initialVisible: {width: 24, height: 24},
	limits: {minWidth: 10, minHeight: 10, maxWidth: 100, maxHeight: 100},
};

let cleanup: (() => void)[] = [];

afterEach(() => {
	for (const fn of cleanup) fn();
	cleanup = [];
});

function mount(options: {left?: number; top?: number} = {}) {
	const element = document.createElement('div');
	element.style.position = 'absolute';
	// Deliberately NOT at the viewport origin: the bug this replaces was reading
	// viewport-relative coordinates, which agree with element-relative ones only
	// while the surface is flush against the corner. The app shell has a navbar,
	// so it never is.
	element.style.left = `${options.left ?? 60}px`;
	element.style.top = `${options.top ?? 40}px`;
	element.style.width = '800px';
	element.style.height = '600px';
	document.body.appendChild(element);

	const {camera, cameraControl} = createCamera(config);
	const eventEmitter = createCanvasEventEmitter();
	const clicks: {x: number; y: number}[] = [];
	eventEmitter.on('clicked', (position) => clicks.push(position));

	const input = connectSurfaceInput({element, cameraControl, eventEmitter});
	// The ResizeObserver is asynchronous, so seed the size for the first frame.
	cameraControl.resize(800, 600);

	cleanup.push(() => {
		input.dispose();
		element.remove();
	});
	return {element, camera, cameraControl, clicks};
}

function pointer(
	element: Element,
	type: string,
	init: {x: number; y: number; id?: number},
) {
	const rect = element.getBoundingClientRect();
	element.dispatchEvent(
		new PointerEvent(type, {
			pointerId: init.id ?? 1,
			pointerType: 'mouse',
			isPrimary: true,
			button: 0,
			buttons: type === 'pointerup' ? 0 : 1,
			clientX: rect.left + init.x,
			clientY: rect.top + init.y,
			bubbles: true,
			cancelable: true,
		}),
	);
}

describe('connectSurfaceInput', () => {
	it('reports a click in game units, relative to the surface', () => {
		const {element, clicks} = mount();
		// Dead centre of an 800x600 surface showing 24 units of height at scale
		// 25, centred on the origin.
		pointer(element, 'pointerdown', {x: 400, y: 300});
		pointer(element, 'pointerup', {x: 400, y: 300});
		expect(clicks).toEqual([{x: 0, y: 0}]);
	});

	/**
	 * The click leaves as an exact world point, NOT snapped to a cell: which cell
	 * a point is in is a game rule, and this layer must not decide it.
	 */
	it('reports the exact point, unsnapped', () => {
		const {element, clicks} = mount();
		// 10px right of centre at scale 25 is 0.4 of a unit.
		pointer(element, 'pointerdown', {x: 410, y: 300});
		pointer(element, 'pointerup', {x: 410, y: 300});
		expect(clicks[0].x).toBeCloseTo(0.4, 9);
		expect(clicks[0].y).toBeCloseTo(0, 9);
	});

	it('pans the camera on a drag, and reports no click', () => {
		const {element, cameraControl, clicks} = mount();
		pointer(element, 'pointerdown', {x: 400, y: 300});
		pointer(element, 'pointermove', {x: 300, y: 300});
		pointer(element, 'pointerup', {x: 300, y: 300});

		// Dragging the content 100px left at scale 25 moves the camera 4 right.
		expect(cameraControl.current.transform.centerX).toBeCloseTo(4, 9);
		expect(clicks).toEqual([]);
	});

	/**
	 * The regression this whole layer exists to make impossible: coordinates read
	 * against the viewport instead of the surface. Moving the surface must not
	 * change where a click on its centre lands.
	 */
	it('is unaffected by where the surface sits on the page', () => {
		const near = mount({left: 0, top: 0});
		pointer(near.element, 'pointerdown', {x: 400, y: 300});
		pointer(near.element, 'pointerup', {x: 400, y: 300});

		const far = mount({left: 250, top: 130});
		pointer(far.element, 'pointerdown', {x: 400, y: 300});
		pointer(far.element, 'pointerup', {x: 400, y: 300});

		expect(far.clicks).toEqual(near.clicks);
	});

	it('stops listening once disposed', () => {
		const {element, clicks} = mount();
		for (const fn of cleanup) fn();
		cleanup = [];

		pointer(element, 'pointerdown', {x: 400, y: 300});
		pointer(element, 'pointerup', {x: 400, y: 300});
		expect(clicks).toEqual([]);
	});
});
