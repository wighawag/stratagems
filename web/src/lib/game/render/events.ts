/**
 * What the canvas reports upward.
 *
 * The canvas knows about pixels and pointers; it must not know what a click
 * MEANS. It emits a world-space POINT and the game decides what that is, which
 * is what keeps the render layer free of game rules and lets a game swap the
 * whole surface out.
 */
import {EventEmitter} from 'tseep/lib/ee-safe';

export type CanvasEvents = {
	/**
	 * A click that was not part of a drag, in game units.
	 *
	 * FRACTIONAL, and deliberately so: it is where the player pointed, not which
	 * cell that is. Snapping it (`Math.round` for a grid centred on integers,
	 * `Math.floor` for one cornered on them, something else entirely for a hex
	 * board) is the game's decision and happens in the game's own click handler.
	 */
	clicked: (position: {x: number; y: number}) => void;
};

export type CanvasEventEmitter = EventEmitter<CanvasEvents>;

export function createCanvasEventEmitter(): CanvasEventEmitter {
	return new EventEmitter<CanvasEvents>();
}
