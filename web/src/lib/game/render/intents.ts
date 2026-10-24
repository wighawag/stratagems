/**
 * What a control DID, before anyone decides what it MEANS.
 *
 * The same split `gestures.ts` makes for pointers: a recogniser turns raw
 * input into an intent, and the GAME turns the intent into a move. Neither
 * half knows the other's business, which is what lets one mapping serve a
 * keyboard, a gamepad and an on-screen d-pad without three copies of the
 * game's rules.
 *
 * DELIBERATELY SMALL, and named after the shape of the input rather than
 * after any game. A direction, a confirming action, a second action and a way
 * back is what a board game's controls are; "step north", "commit the round"
 * and "leave the world" are what a particular game calls them, and that
 * translation belongs in the game. Anything that has to say "avatar" or
 * "cycle" to be described is on the wrong side of this line.
 */

/**
 * Which way, with no opinion on what the axes mean.
 *
 * Not a vector: whether north is `y - 1` or `y + 1`, and whether the board is
 * square at all, is the game's convention. The same argument `gestures.ts`
 * makes for emitting a fractional point rather than a cell.
 */
export type Direction = 'up' | 'down' | 'left' | 'right';

export type ControlIntent =
	/** A directional press: an arrow, WASD, a d-pad, a stick pushed far enough. */
	| {type: 'direction'; direction: Direction}
	/** The confirming action: Enter, or the gamepad's south button. */
	| {type: 'confirm'}
	/**
	 * A second action, which the game names.
	 *
	 * Every board game has one thing that is not "confirm" and not "back", and
	 * no two games agree on what it is, so it is numbered here rather than
	 * named.
	 */
	| {type: 'secondary'}
	/** Take it back: Backspace, or the gamepad's east button. */
	| {type: 'cancel'}
	/**
	 * Any further action, which the game NAMES and maps its own keys and
	 * buttons to (`KeyOptions.actions`, `GamepadOptions.actions`).
	 *
	 * The four above are what every board game has; some have more. bomber-world
	 * has three non-directional actions for the one `secondary` (leave the
	 * world, an instant bomb, a delayed bomb), and before this existed the only
	 * ways to reach a third were to overload an intent or to listen for a key
	 * outside this seam, which also cut the gamepad off from it. The name is the
	 * game's own word and nothing here reads it: the adapters only carry it from
	 * the key or button the game bound it to, to the handler that acts on it.
	 */
	| {type: 'action'; name: string};

/** Handed each intent as it is recognised, in the order it happened. */
export type ControlIntentHandler = (intent: ControlIntent) => void;
