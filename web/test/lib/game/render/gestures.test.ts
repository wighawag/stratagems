import {describe, expect, it} from 'vitest';
import {
	createGestureRecognizer,
	type GestureIntent,
} from '$lib/game/render/gestures';

/**
 * The recogniser takes plain numbers rather than DOM events precisely so these
 * cases can be written. Several of them (a third finger mid-pinch, lifting one
 * finger out of a pinch, a pointer the browser cancels) are close to impossible
 * to perform reliably by hand, and they are exactly the ones that break.
 */

const pans = (intents: GestureIntent[]) =>
	intents.filter((i) => i.type === 'pan');
const zooms = (intents: GestureIntent[]) =>
	intents.filter((i) => i.type === 'zoom');
const clicks = (intents: GestureIntent[]) =>
	intents.filter((i) => i.type === 'click');

describe('tap versus drag', () => {
	it('reports a click when the pointer barely moved', () => {
		const recognizer = createGestureRecognizer();
		recognizer.pointerDown({pointerId: 1, x: 100, y: 100});
		// A finger always wobbles a little; a threshold of zero means a phone can
		// never click.
		recognizer.pointerMove({pointerId: 1, x: 102, y: 103});
		const intents = recognizer.pointerUp({pointerId: 1, x: 102, y: 103});
		expect(clicks(intents)).toEqual([{type: 'click', at: {x: 102, y: 103}}]);
	});

	it('reports no click once the pointer has passed the threshold', () => {
		const recognizer = createGestureRecognizer();
		recognizer.pointerDown({pointerId: 1, x: 100, y: 100});
		recognizer.pointerMove({pointerId: 1, x: 140, y: 100});
		expect(
			clicks(recognizer.pointerUp({pointerId: 1, x: 140, y: 100})),
		).toEqual([]);
	});

	/**
	 * The threshold is measured from where the pointer went DOWN, not from the
	 * previous move. Measuring from the previous move lets a slow drag across the
	 * whole board end in a click, because no single step ever exceeded it.
	 */
	it('measures the threshold from the press, not from the last move', () => {
		const recognizer = createGestureRecognizer();
		recognizer.pointerDown({pointerId: 1, x: 0, y: 0});
		for (let x = 1; x <= 100; x++) {
			recognizer.pointerMove({pointerId: 1, x, y: 0});
		}
		expect(clicks(recognizer.pointerUp({pointerId: 1, x: 100, y: 0}))).toEqual(
			[],
		);
	});

	it('pans by the delta since the previous move', () => {
		const recognizer = createGestureRecognizer();
		recognizer.pointerDown({pointerId: 1, x: 100, y: 100});
		expect(
			pans(recognizer.pointerMove({pointerId: 1, x: 130, y: 110})),
		).toEqual([{type: 'pan', dx: 30, dy: 10}]);
		expect(
			pans(recognizer.pointerMove({pointerId: 1, x: 135, y: 100})),
		).toEqual([{type: 'pan', dx: 5, dy: -10}]);
	});

	it('ignores a pointer it never saw go down', () => {
		const recognizer = createGestureRecognizer();
		expect(recognizer.pointerMove({pointerId: 9, x: 10, y: 10})).toEqual([]);
		expect(recognizer.pointerUp({pointerId: 9, x: 10, y: 10})).toEqual([]);
	});
});

describe('pinch', () => {
	it('zooms by the ratio of the fingers separation, about their midpoint', () => {
		const recognizer = createGestureRecognizer();
		recognizer.pointerDown({pointerId: 1, x: 100, y: 100});
		recognizer.pointerDown({pointerId: 2, x: 200, y: 100});
		// Separation 100 becomes 200: twice as far apart is twice the zoom.
		const intents = recognizer.pointerMove({pointerId: 2, x: 300, y: 100});
		const zoom = zooms(intents)[0];
		expect(zoom).toBeDefined();
		expect(zoom!.type === 'zoom' && zoom!.factor).toBeCloseTo(2, 9);
		expect(zoom!.type === 'zoom' && zoom!.anchor).toEqual({x: 200, y: 100});
	});

	/**
	 * A pinch is two gestures at once. Handling only the separation makes a
	 * two-finger DRAG impossible, which is how most people move around a map on a
	 * touch screen.
	 *
	 * Asserted over the PAIR of moves rather than a single one, and that is not a
	 * weakened assertion but the honest statement of what a pointer API can
	 * promise. Each finger reports separately, so between the two events the
	 * fingers really are closer together, and any recogniser that answers the
	 * question "how far apart are they now" must say so. The invariant that
	 * matters is that a two-finger drag at constant separation is a pure pan ONCE
	 * BOTH FINGERS HAVE REPORTED: the zoom factors multiply back to 1, and the
	 * pans add up to the distance the fingers travelled.
	 *
	 * In practice browsers deliver both moves in one task, so a frame is rendered
	 * from the settled state and the excursion is never drawn. If a device is ever
	 * found that renders between them, the fix is to coalesce in `attachGestures`
	 * (where the event batch is visible), not to make this layer lie about where
	 * the fingers are.
	 */
	it('is a pure pan, over the pair of moves, when separation is constant', () => {
		const recognizer = createGestureRecognizer();
		recognizer.pointerDown({pointerId: 1, x: 100, y: 100});
		recognizer.pointerDown({pointerId: 2, x: 200, y: 100});
		// Both fingers move 50 right.
		const first = recognizer.pointerMove({pointerId: 1, x: 150, y: 100});
		const second = recognizer.pointerMove({pointerId: 2, x: 250, y: 100});
		const intents = [...first, ...second];

		const totalPan = pans(intents).reduce(
			(sum, intent) => sum + (intent.type === 'pan' ? intent.dx : 0),
			0,
		);
		const netZoom = zooms(intents).reduce(
			(product, intent) =>
				product * (intent.type === 'zoom' ? intent.factor : 1),
			1,
		);
		expect(totalPan).toBeCloseTo(50, 9);
		expect(netZoom).toBeCloseTo(1, 9);
	});

	it('never ends a pinch in a click, even if the fingers came back', () => {
		const recognizer = createGestureRecognizer();
		recognizer.pointerDown({pointerId: 1, x: 100, y: 100});
		recognizer.pointerDown({pointerId: 2, x: 200, y: 100});
		recognizer.pointerMove({pointerId: 2, x: 300, y: 100});
		recognizer.pointerMove({pointerId: 2, x: 200, y: 100});
		expect(
			clicks(recognizer.pointerUp({pointerId: 2, x: 200, y: 100})),
		).toEqual([]);
		expect(
			clicks(recognizer.pointerUp({pointerId: 1, x: 100, y: 100})),
		).toEqual([]);
	});

	/**
	 * Lifting one finger out of a pinch must not make the view leap. The
	 * remaining finger keeps panning from where it is, which means re-seeding
	 * from the survivors rather than carrying on with a stale midpoint.
	 */
	it('does not jump when a pinch drops to one finger', () => {
		const recognizer = createGestureRecognizer();
		recognizer.pointerDown({pointerId: 1, x: 100, y: 100});
		recognizer.pointerDown({pointerId: 2, x: 300, y: 100});
		recognizer.pointerMove({pointerId: 2, x: 400, y: 100});
		recognizer.pointerUp({pointerId: 2, x: 400, y: 100});

		// The one remaining finger has not moved, so nothing should happen.
		expect(
			pans(recognizer.pointerMove({pointerId: 1, x: 100, y: 100})),
		).toEqual([]);
		// And a small move pans by exactly that much.
		expect(
			pans(recognizer.pointerMove({pointerId: 1, x: 110, y: 100})),
		).toEqual([{type: 'pan', dx: 10, dy: 0}]);
	});

	/**
	 * A third finger landing mid-pinch is tracked but must not take over: the
	 * pinch pair is the first two pointers down, so the view does not jump when
	 * a palm or a stray finger touches the screen.
	 */
	it('keeps pinching with the original pair when a third finger lands', () => {
		const recognizer = createGestureRecognizer();
		recognizer.pointerDown({pointerId: 1, x: 100, y: 100});
		recognizer.pointerDown({pointerId: 2, x: 200, y: 100});
		recognizer.pointerDown({pointerId: 3, x: 600, y: 600});
		expect(recognizer.pointerMove({pointerId: 3, x: 650, y: 650})).toEqual([]);

		const intents = recognizer.pointerMove({pointerId: 2, x: 300, y: 100});
		expect(zooms(intents)).toHaveLength(1);
	});

	it('drops a cancelled pointer without reporting a click', () => {
		const recognizer = createGestureRecognizer();
		recognizer.pointerDown({pointerId: 1, x: 100, y: 100});
		expect(recognizer.pointerCancel({pointerId: 1, x: 100, y: 100})).toEqual(
			[],
		);
		expect(recognizer.active).toBe(0);
	});
});

describe('wheel', () => {
	it('zooms in on a scroll up and out on a scroll down', () => {
		const recognizer = createGestureRecognizer();
		const inward = zooms(recognizer.wheel({x: 10, y: 20, deltaY: -100}))[0];
		const outward = zooms(recognizer.wheel({x: 10, y: 20, deltaY: 100}))[0];
		expect(inward!.type === 'zoom' && inward!.factor).toBeGreaterThan(1);
		expect(outward!.type === 'zoom' && outward!.factor).toBeLessThan(1);
		expect(inward!.type === 'zoom' && inward!.anchor).toEqual({x: 10, y: 20});
	});

	/**
	 * Exponential rather than linear, so a notch out exactly undoes a notch in.
	 * A linear implementation drifts, and on a large delta it can even flip the
	 * sign and zoom the wrong way.
	 */
	it('is symmetric: a notch out undoes a notch in', () => {
		const recognizer = createGestureRecognizer();
		const inward = zooms(recognizer.wheel({x: 0, y: 0, deltaY: -240}))[0];
		const outward = zooms(recognizer.wheel({x: 0, y: 0, deltaY: 240}))[0];
		const product =
			(inward!.type === 'zoom' ? inward!.factor : 0) *
			(outward!.type === 'zoom' ? outward!.factor : 0);
		expect(product).toBeCloseTo(1, 9);
	});

	/**
	 * Firefox reports wheel deltas in LINES (3 per notch, not ~100 pixels).
	 * Treating those as pixels makes the wheel almost dead there, which is the
	 * kind of bug that only ever gets reported as "zoom feels broken".
	 */
	it('scales line and page deltas so the wheel works in every browser', () => {
		const recognizer = createGestureRecognizer();
		const asPixels = zooms(recognizer.wheel({x: 0, y: 0, deltaY: -3}))[0];
		const asLines = zooms(
			recognizer.wheel({x: 0, y: 0, deltaY: -3, deltaMode: 1}),
		)[0];
		const pixelFactor = asPixels!.type === 'zoom' ? asPixels!.factor : 0;
		const lineFactor = asLines!.type === 'zoom' ? asLines!.factor : 0;
		expect(lineFactor).toBeGreaterThan(pixelFactor);
	});

	it('ignores a zero delta', () => {
		const recognizer = createGestureRecognizer();
		expect(recognizer.wheel({x: 0, y: 0, deltaY: 0})).toEqual([]);
	});
});
