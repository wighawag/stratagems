/**
 * Wiring a surface to the camera and the game.
 *
 * Every host does the same three things: report its size, feed gestures to the
 * camera, and turn a click into a world coordinate the game can act on. Doing
 * them here rather than in each canvas component is what makes a second
 * renderer cheap, and it keeps the components logic-free, which the repo's
 * Svelte conventions ask for anyway.
 *
 * The split of responsibility is the point: the camera consumes pan and zoom
 * because those are view concerns, and the click goes to the game because what
 * a click MEANS is a game rule. A host never decides either, and neither does
 * this file: the click leaves here as a world POINT, and which cell, tile or
 * entity that is belongs to the game.
 */
import type {CameraControl} from './camera';
import type {CanvasEventEmitter} from './events';
import {attachGestures, type GestureOptions} from './gestures';

export type SurfaceInput = {
	/** Detach listeners and the resize observer. */
	dispose(): void;
};

export function connectSurfaceInput(params: {
	element: HTMLElement;
	cameraControl: CameraControl;
	eventEmitter: CanvasEventEmitter;
	gestures?: GestureOptions;
}): SurfaceInput {
	const {element, cameraControl, eventEmitter} = params;

	const detachGestures = attachGestures(
		element,
		(intent) => {
			if (intent.type === 'click') {
				// The exact point, in game units, NOT snapped to anything.
				//
				// Snapping is a game rule: rounding to the nearest integer makes
				// every game on this template a square grid whose cells are centred
				// on integers, which is this game's convention and not the
				// framework's. A hex board, a continuous world or a game that picks
				// the nearest entity rather than the nearest cell all decide it
				// differently, and this module has no business knowing which.
				eventEmitter.emit('clicked', cameraControl.toWorld(intent.at));
				return;
			}
			cameraControl.handle(intent);
		},
		params.gestures,
	);

	// HOVER, beside the gestures rather than in them: it moves nothing and is
	// not a gesture, only where an idle mouse points. A pressed button is a
	// drag in the making, so it is not hovering; neither is a touch.
	// The rect is cached for the reason `attachGestures` caches its own (a
	// forced layout per mouse move otherwise), and dropped whenever the pointer
	// leaves or the surface is resized.
	/** Where the mouse hovers, in surface pixels; none when it does not. */
	let hoverAt: {x: number; y: number} | undefined;
	let hoverRect: DOMRect | undefined;
	function onHoverMove(event: PointerEvent) {
		if (event.pointerType === 'touch' || event.buttons !== 0) {
			onHoverLeave();
			return;
		}
		const rect = (hoverRect ??= element.getBoundingClientRect());
		hoverAt = {x: event.clientX - rect.left, y: event.clientY - rect.top};
		eventEmitter.emit('hovered', cameraControl.toWorld(hoverAt));
	}
	function onHoverLeave() {
		hoverRect = undefined;
		if (!hoverAt) return;
		hoverAt = undefined;
		eventEmitter.emit('hovered', undefined);
	}
	// The board moves under a still mouse too (a wheel zoom, a key pan, the
	// camera following an army): say again what it points at now.
	const stopHoverFollow = cameraControl.transform.subscribe(() => {
		if (hoverAt) eventEmitter.emit('hovered', cameraControl.toWorld(hoverAt));
	});
	element.addEventListener('pointermove', onHoverMove);
	element.addEventListener('pointerleave', onHoverLeave);

	// `clientWidth`/`clientHeight` are CSS pixels and exclude borders, which is
	// exactly the space the surface draws into. Device pixel ratio is applied by
	// the host to its own backing store, never here.
	function reportSize() {
		hoverRect = undefined;
		cameraControl.resize(element.clientWidth, element.clientHeight);
	}
	const observer = new ResizeObserver(reportSize);
	observer.observe(element);
	reportSize();

	return {
		dispose() {
			observer.disconnect();
			detachGestures();
			element.removeEventListener('pointermove', onHoverMove);
			element.removeEventListener('pointerleave', onHoverLeave);
			stopHoverFollow();
		},
	};
}
