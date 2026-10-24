/**
 * Pointer gestures: drag to pan, pinch and wheel to zoom, tap to click.
 *
 * The half of `pixi-viewport` that is genuinely tedious to rewrite, which is
 * why it lives in the framework rather than in a game. It is split in two on
 * purpose:
 *
 * - {@link createGestureRecognizer} is a state machine over plain numbers. No
 *   DOM types, so it runs in the node test project and every branch (including
 *   the ones a human cannot reliably perform by hand, like lifting one finger
 *   out of a pinch) is testable.
 * - {@link attachGestures} is the DOM binding, and is deliberately thin.
 *
 * It emits INTENTS rather than moving anything. What a pan or a zoom does to
 * the camera is `camera.ts`'s business, and what a click MEANS is the game's,
 * which is how the same gestures serve a pixi surface and a canvas-2d one.
 *
 * Coordinates in and out are CSS pixels relative to the surface's top-left
 * corner. Not clientX/clientY: those are relative to the browser viewport, and
 * the two agree only while the surface sits flush at the viewport origin. It
 * does not (the app shell has a navbar), and the previous canvas shipped that
 * exact bug for a while, so the conversion happens once in `attachGestures` and
 * the wrong number is never in scope anywhere else.
 */
import type {Point} from './view-transform';

export type GestureIntent =
	/** Drag the content by this many CSS pixels. */
	| {type: 'pan'; dx: number; dy: number}
	/** Multiply the scale by `factor`, keeping the world under `anchor` fixed. */
	| {type: 'zoom'; factor: number; anchor: Point}
	/** A press and release that never became a drag. */
	| {type: 'click'; at: Point};

export type PointerSample = {
	/** Distinguishes fingers. Any stable number; the DOM's `pointerId`. */
	pointerId: number;
	x: number;
	y: number;
};

export type WheelSample = {
	x: number;
	y: number;
	deltaY: number;
	/** `WheelEvent.deltaMode`: 0 pixels, 1 lines, 2 pages. */
	deltaMode?: number;
};

export type GestureOptions = {
	/**
	 * How far a pointer may travel and still count as a click, in CSS pixels.
	 *
	 * Not zero, and not because of mouse jitter: a touch screen moves several
	 * pixels during any tap made with a human finger, so a threshold of zero
	 * means a phone can pan but can never click.
	 */
	clickThreshold?: number;
	/**
	 * Wheel sensitivity: the scale factor per 100 pixels of wheel delta.
	 *
	 * Applied exponentially, so zooming is symmetric (a notch out exactly undoes
	 * a notch in) and compounding a fast scroll cannot flip the sign, which
	 * linear wheel handling does when the delta is large.
	 */
	wheelFactorPer100?: number;
};

const DEFAULT_CLICK_THRESHOLD = 5;
const DEFAULT_WHEEL_FACTOR = 1.15;

/**
 * Rough CSS pixels for a wheel notch reported in lines or pages.
 *
 * Firefox reports lines, and the numbers are small (3 per notch), so treating
 * them as pixels makes the wheel nearly dead there. The multipliers only have
 * to be the right order of magnitude.
 */
const LINE_HEIGHT = 16;
const PAGE_HEIGHT = 400;

type ActivePointer = {
	pointerId: number;
	/** Where it went down, for the click threshold. */
	startX: number;
	startY: number;
	/** Where it was last seen, for the pan delta. */
	x: number;
	y: number;
	/** Set once it has travelled past the threshold; never unset. */
	moved: boolean;
};

export type GestureRecognizer = {
	pointerDown(sample: PointerSample): GestureIntent[];
	pointerMove(sample: PointerSample): GestureIntent[];
	pointerUp(sample: PointerSample): GestureIntent[];
	/** A pointer the browser took away (a system gesture, a lost capture). */
	pointerCancel(sample: PointerSample): GestureIntent[];
	wheel(sample: WheelSample): GestureIntent[];
	/** Forget every pointer, for a surface that is going away. */
	reset(): void;
	/** Whether a gesture is in progress. Exposed for tests and for cursors. */
	readonly active: number;
};

function distance(a: ActivePointer, b: ActivePointer): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: ActivePointer, b: ActivePointer): Point {
	return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
}

export function createGestureRecognizer(
	options: GestureOptions = {},
): GestureRecognizer {
	const clickThreshold = options.clickThreshold ?? DEFAULT_CLICK_THRESHOLD;
	const wheelFactor = options.wheelFactorPer100 ?? DEFAULT_WHEEL_FACTOR;

	/**
	 * Insertion-ordered, and the order matters: a pinch always uses the FIRST
	 * TWO pointers down. A third finger landing mid-pinch is tracked but ignored,
	 * rather than silently taking over and making the view jump.
	 */
	const pointers = new Map<number, ActivePointer>();

	/**
	 * Distance between the pinch pair on the previous move, or undefined when no
	 * pinch is in progress.
	 *
	 * Kept as state rather than recomputed from the start of the gesture so that
	 * a pinch that begins after a pan (a second finger landing) starts from the
	 * distance at that moment, with no jump.
	 */
	let pinchDistance: number | undefined;
	let pinchMidpoint: Point | undefined;

	function pinchPair(): [ActivePointer, ActivePointer] | undefined {
		if (pointers.size < 2) return undefined;
		const [first, second] = [...pointers.values()];
		return [first, second];
	}

	function beginPinch() {
		const pair = pinchPair();
		if (!pair) {
			pinchDistance = undefined;
			pinchMidpoint = undefined;
			return;
		}
		pinchDistance = distance(pair[0], pair[1]);
		pinchMidpoint = midpoint(pair[0], pair[1]);
	}

	return {
		get active() {
			return pointers.size;
		},

		pointerDown(sample) {
			pointers.set(sample.pointerId, {
				pointerId: sample.pointerId,
				startX: sample.x,
				startY: sample.y,
				x: sample.x,
				y: sample.y,
				moved: false,
			});
			if (pointers.size === 2) beginPinch();
			return [];
		},

		pointerMove(sample) {
			const pointer = pointers.get(sample.pointerId);
			if (!pointer) return [];

			const previous = {x: pointer.x, y: pointer.y};
			pointer.x = sample.x;
			pointer.y = sample.y;
			if (
				Math.abs(sample.x - pointer.startX) > clickThreshold ||
				Math.abs(sample.y - pointer.startY) > clickThreshold
			) {
				pointer.moved = true;
			}

			const pair = pinchPair();
			if (pair) {
				// A pinch is two gestures at once: the fingers' separation zooms and
				// their midpoint pans. Handling only the first makes a two-finger
				// drag impossible, which is how most people move around a map on a
				// phone.
				//
				// Each finger reports its own move, so a two-finger drag arrives as
				// two events and the separation genuinely differs between them: the
				// intents zoom slightly out and back, and only settle to a pure pan
				// once both have reported. That is a property of the pointer API, not
				// a rounding problem, and it is invisible because browsers deliver
				// both moves in one task and render after. If a device is ever found
				// that renders in between, coalesce in `attachGestures`, where the
				// batch is visible; do not make this function report a position a
				// finger is not at.
				if (!pair.some((p) => p.pointerId === sample.pointerId)) return [];

				const nextDistance = distance(pair[0], pair[1]);
				const nextMidpoint = midpoint(pair[0], pair[1]);
				const intents: GestureIntent[] = [];

				if (pinchMidpoint) {
					const dx = nextMidpoint.x - pinchMidpoint.x;
					const dy = nextMidpoint.y - pinchMidpoint.y;
					if (dx !== 0 || dy !== 0) intents.push({type: 'pan', dx, dy});
				}
				if (
					pinchDistance !== undefined &&
					pinchDistance > 0 &&
					nextDistance > 0
				) {
					const factor = nextDistance / pinchDistance;
					if (factor !== 1) {
						intents.push({type: 'zoom', factor, anchor: nextMidpoint});
					}
				}

				// Both fingers are in a gesture, so neither may end as a click. A
				// pinch that happens to end with both fingers near where they started
				// would otherwise fire two clicks.
				pair[0].moved = true;
				pair[1].moved = true;

				pinchDistance = nextDistance;
				pinchMidpoint = nextMidpoint;
				return intents;
			}

			const dx = sample.x - previous.x;
			const dy = sample.y - previous.y;
			if (dx === 0 && dy === 0) return [];
			return [{type: 'pan', dx, dy}];
		},

		pointerUp(sample) {
			const pointer = pointers.get(sample.pointerId);
			if (!pointer) return [];
			pointers.delete(sample.pointerId);

			// Dropping from two fingers to one: re-seed from whoever is left, so the
			// remaining finger carries on panning from where it is instead of the
			// view leaping by the midpoint's sudden move.
			if (pointers.size >= 2) beginPinch();
			else {
				pinchDistance = undefined;
				pinchMidpoint = undefined;
			}

			if (pointer.moved) return [];
			return [{type: 'click', at: {x: sample.x, y: sample.y}}];
		},

		pointerCancel(sample) {
			// Same bookkeeping as an up, minus the click: a cancelled pointer is one
			// the browser took for itself, and the player did not choose to release
			// it where it happens to be.
			if (!pointers.delete(sample.pointerId)) return [];
			if (pointers.size >= 2) beginPinch();
			else {
				pinchDistance = undefined;
				pinchMidpoint = undefined;
			}
			return [];
		},

		wheel(sample) {
			const mode = sample.deltaMode ?? 0;
			const pixels =
				mode === 1
					? sample.deltaY * LINE_HEIGHT
					: mode === 2
						? sample.deltaY * PAGE_HEIGHT
						: sample.deltaY;
			if (pixels === 0) return [];
			// Negative deltaY is a scroll up, which zooms IN.
			const factor = Math.pow(wheelFactor, -pixels / 100);
			return [{type: 'zoom', factor, anchor: {x: sample.x, y: sample.y}}];
		},

		reset() {
			pointers.clear();
			pinchDistance = undefined;
			pinchMidpoint = undefined;
		},
	};
}

/**
 * Bind a recogniser to a real element. Returns the teardown.
 *
 * Uses pointer capture, which is what replaces `pixi-viewport`'s
 * `allowPreserveDragOutside`: a drag that leaves the canvas keeps being
 * delivered here until the button comes up, including over other elements and
 * outside the window. It is also the reason move and up are bound to the
 * element rather than to `window`, which is the usual way to get the same
 * effect and leaks a listener per mount if any path forgets to remove it.
 */
export function attachGestures(
	element: HTMLElement,
	onIntent: (intent: GestureIntent) => void,
	options: GestureOptions = {},
): () => void {
	const recognizer = createGestureRecognizer(options);

	/**
	 * The element's position on the page, cached.
	 *
	 * `getBoundingClientRect` forces the browser to flush pending layout, and
	 * this runs on every pointer move: during a drag that is a forced layout per
	 * event, several per frame, in the one hot path this module exists to own.
	 *
	 * Invalidated on anything that can move the element without a pointer event:
	 * a scroll anywhere in the ancestor chain (hence the capture phase, since
	 * scroll does not bubble), a window resize, and the start of each gesture,
	 * which covers layout changes the app itself made in between.
	 */
	let rect: DOMRect | undefined;
	function invalidateRect() {
		rect = undefined;
	}

	function localPoint(event: PointerEvent | WheelEvent): Point {
		if (!rect) rect = element.getBoundingClientRect();
		return {x: event.clientX - rect.left, y: event.clientY - rect.top};
	}

	function emit(intents: GestureIntent[]) {
		for (const intent of intents) onIntent(intent);
	}

	function onPointerDown(event: PointerEvent) {
		// Ignore secondary mouse buttons: a right-click is a context menu (or a
		// game's own action), never a pan.
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		invalidateRect();
		const point = localPoint(event);
		try {
			element.setPointerCapture(event.pointerId);
		} catch {
			// Throws for a pointer id the browser does not consider active, which
			// happens with synthetic events in tests and on some engines when the
			// pointer is released between dispatch and handling. Capture is an
			// improvement (a drag that leaves the canvas keeps working), not a
			// requirement, so losing it must not lose the gesture with it.
		}
		emit(recognizer.pointerDown({pointerId: event.pointerId, ...point}));
	}

	function onPointerMove(event: PointerEvent) {
		emit(
			recognizer.pointerMove({
				pointerId: event.pointerId,
				...localPoint(event),
			}),
		);
	}

	function onPointerUp(event: PointerEvent) {
		if (element.hasPointerCapture(event.pointerId)) {
			element.releasePointerCapture(event.pointerId);
		}

		emit(
			recognizer.pointerUp({pointerId: event.pointerId, ...localPoint(event)}),
		);
	}

	function onPointerCancel(event: PointerEvent) {
		emit(
			recognizer.pointerCancel({
				pointerId: event.pointerId,
				...localPoint(event),
			}),
		);
	}

	function onWheel(event: WheelEvent) {
		// The page must not scroll while the player zooms the board. Requires the
		// listener to be non-passive, which is not the default for wheel on some
		// browsers, hence the explicit option below.
		event.preventDefault();
		const point = localPoint(event);
		emit(
			recognizer.wheel({
				...point,
				deltaY: event.deltaY,
				deltaMode: event.deltaMode,
			}),
		);
	}

	element.addEventListener('pointerdown', onPointerDown);
	element.addEventListener('pointermove', onPointerMove);
	element.addEventListener('pointerup', onPointerUp);
	element.addEventListener('pointercancel', onPointerCancel);
	element.addEventListener('wheel', onWheel, {passive: false});
	window.addEventListener('scroll', invalidateRect, {
		capture: true,
		passive: true,
	});
	window.addEventListener('resize', invalidateRect, {passive: true});

	return () => {
		element.removeEventListener('pointerdown', onPointerDown);
		element.removeEventListener('pointermove', onPointerMove);
		element.removeEventListener('pointerup', onPointerUp);
		element.removeEventListener('pointercancel', onPointerCancel);
		element.removeEventListener('wheel', onWheel);
		window.removeEventListener('scroll', invalidateRect, {capture: true});
		window.removeEventListener('resize', invalidateRect);
		recognizer.reset();
	};
}
