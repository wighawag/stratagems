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

	// `clientWidth`/`clientHeight` are CSS pixels and exclude borders, which is
	// exactly the space the surface draws into. Device pixel ratio is applied by
	// the host to its own backing store, never here.
	function reportSize() {
		cameraControl.resize(element.clientWidth, element.clientHeight);
	}
	const observer = new ResizeObserver(reportSize);
	observer.observe(element);
	reportSize();

	return {
		dispose() {
			observer.disconnect();
			detachGestures();
		},
	};
}
