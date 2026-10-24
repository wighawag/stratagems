/**
 * Keyboard to intents.
 *
 * Split the way `gestures.ts` is split, for the same reason:
 *
 * - {@link recognizeKey} is a pure function over a plain sample. No DOM types,
 *   so every branch is testable in the node project, including the ones that
 *   are awkward to perform by hand (a held key repeating, a modifier chord).
 * - {@link attachKeys} is the DOM binding, and is deliberately thin.
 *
 * WHAT A HAND-WRITTEN ONE GETS WRONG, from the version this replaces in a
 * game built on this template: it bound to `document` unconditionally, with no
 * `preventDefault` and no check for where the keystroke was going, so arrows
 * and space acted on the board while the player was typing in a modal.
 *
 * WHERE A KEYSTROKE IS AIMED comes in two kinds here rather than one, because
 * "is it an interactive element" is too blunt in both directions. A text field
 * consumes EVERY key, so the game must hear none of them. A button consumes
 * only the keys that activate it, so a game that ignored the arrows as well
 * would go dead the moment the player pressed the on-screen d-pad with a mouse:
 * the button keeps focus, and the keyboard stops working with nothing on screen
 * to explain why.
 */
import type {ControlIntent, ControlIntentHandler} from './intents';

/**
 * One keystroke, as much of it as the recogniser needs.
 *
 * `key` is `KeyboardEvent.key`, which is the LAYOUT-DEPENDENT character. That
 * is right for the letter keys (a French keyboard's WASD is not under the same
 * fingers, and a player on one expects their own letters) and irrelevant for
 * the named keys, which are the same everywhere.
 */
export type KeySample = {
	key: string;
	/** The operating system repeating a held key. */
	repeat?: boolean;
	/** Any of ctrl / meta / alt, which make this a browser or OS shortcut. */
	modified?: boolean;
	/**
	 * The keystroke is going somewhere that consumes EVERY key: a text field, a
	 * select, anything editable.
	 */
	intoText?: boolean;
	/**
	 * The keystroke is going to something that is ACTIVATED by a key: a button, a
	 * link, a summary. Such an element owns Enter and Space and nothing else.
	 */
	intoControl?: boolean;
};

export type KeyOptions = {
	/**
	 * Whether a HELD key repeats the intent. Off by default, and that is a game
	 * decision this defaults to the safe side of: a turn is a handful of moves
	 * long, and auto-repeat at 30 a second spends all of them before a finger
	 * comes off the key.
	 */
	repeats?: boolean;
	/**
	 * Keys the GAME binds to actions of its own, as `KeyboardEvent.key` to the
	 * name it will receive in `{type: 'action', name}`.
	 *
	 * Consulted BEFORE the default table, so a game can also take a default key
	 * back (bind `x` and it stops being a spelling of `secondary`). Everything
	 * else about a keystroke still applies to it: not while typing, not in a
	 * chord, not on repeat unless `repeats`, and not Enter or Space into a
	 * focused control.
	 */
	actions?: Readonly<Record<string, string>>;
};

/**
 * The whole mapping, in one table so it can be read at a glance.
 *
 * Arrows and WASD both, because a player with one hand on a mouse uses the
 * arrows and a player using the keyboard alone uses the letters. Enter
 * confirms and Space is a second spelling of the SECONDARY action, which is a
 * game-independent default a game is free to disagree with by mapping the
 * intents differently.
 */
const KEYS: Record<string, ControlIntent> = {
	ArrowUp: {type: 'direction', direction: 'up'},
	ArrowDown: {type: 'direction', direction: 'down'},
	ArrowLeft: {type: 'direction', direction: 'left'},
	ArrowRight: {type: 'direction', direction: 'right'},
	w: {type: 'direction', direction: 'up'},
	W: {type: 'direction', direction: 'up'},
	s: {type: 'direction', direction: 'down'},
	S: {type: 'direction', direction: 'down'},
	a: {type: 'direction', direction: 'left'},
	A: {type: 'direction', direction: 'left'},
	d: {type: 'direction', direction: 'right'},
	D: {type: 'direction', direction: 'right'},
	Enter: {type: 'confirm'},
	' ': {type: 'secondary'},
	x: {type: 'secondary'},
	X: {type: 'secondary'},
	Backspace: {type: 'cancel'},
};

/**
 * The keys a focusable control activates on, and therefore the only ones it
 * takes from the game.
 */
const ACTIVATION_KEYS = new Set(['Enter', ' ']);

/**
 * The intent a keystroke carries, or undefined for one that is not ours.
 *
 * Undefined is load-bearing rather than a null object: the DOM half only calls
 * `preventDefault` when something came back, so every key the game does not use
 * keeps doing whatever the browser and the page would have done with it.
 */
export function recognizeKey(
	sample: KeySample,
	options: KeyOptions = {},
): ControlIntent | undefined {
	// A chord is a shortcut somebody else owns. Ctrl+W closes the tab and
	// Alt+Left goes back; answering the bare letter and the chord alike makes
	// the game fight the browser.
	if (sample.modified) return undefined;
	// Someone is typing. Every key belongs to them, including the arrows, which
	// move a caret.
	if (sample.intoText) return undefined;
	// A focused button already acts on Enter and Space, so without this one press
	// does two things: it presses the button AND takes a turn. It has no use for
	// the arrows, so those still reach the game.
	if (sample.intoControl && ACTIVATION_KEYS.has(sample.key)) return undefined;
	if (sample.repeat && !options.repeats) return undefined;
	const action = options.actions?.[sample.key];
	if (action !== undefined) return {type: 'action', name: action};
	return KEYS[sample.key];
}

/**
 * Elements that consume every keystroke, and elements that consume only the
 * two that activate them.
 *
 * `closest` rather than a check on the target's own tag, because the event
 * target can be a child of the thing with focus: a span inside a button, a
 * label inside a summary.
 */
const TEXT_SELECTOR =
	'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"]';
const CONTROL_SELECTOR =
	'button, a[href], summary, [role="button"], [tabindex]:not([tabindex="-1"])';

function matches(target: EventTarget | null, selector: string): boolean {
	// Duck-typed rather than `instanceof Element`, and not for style: `Element`
	// is a global that does not exist off-browser, so naming it here would make
	// this module throw wherever there is no DOM instead of quietly finding
	// nothing. Anything that answers `closest` is an element for this purpose.
	const element = target as {closest?: (selector: string) => unknown} | null;
	if (!element || typeof element.closest !== 'function') return false;
	return element.closest(selector) !== null;
}

/**
 * Bind a keyboard to a handler. Returns the teardown.
 *
 * Bound to a TARGET rather than to `document` by default only in the sense
 * that the caller passes one: keyboard events without focus go to the
 * document, and a canvas is not focusable, so the document is the honest
 * default and the guards above are what keep it from stealing keys.
 *
 * The lifetime of the binding is the CALLER's business and is a real decision:
 * bound to the route rather than to the canvas, input survives a canvas
 * unmount (a dynamic import, a surface that failed to load) and still does not
 * outlive the board.
 */
export function attachKeys(
	target: {
		addEventListener: typeof document.addEventListener;
		removeEventListener: typeof document.removeEventListener;
	},
	onIntent: ControlIntentHandler,
	options: KeyOptions = {},
): () => void {
	function onKeyDown(event: KeyboardEvent) {
		const intent = recognizeKey(
			{
				key: event.key,
				repeat: event.repeat,
				modified: event.ctrlKey || event.metaKey || event.altKey,
				intoText: matches(event.target, TEXT_SELECTOR),
				intoControl: matches(event.target, CONTROL_SELECTOR),
			},
			options,
		);
		if (!intent) return;
		// Only for keys the game actually took. Arrows and space scroll the page,
		// and a board that jumps a screen down on every step is unplayable; keys we
		// did not use keep their default behaviour, which is why this is here and
		// not at the top.
		event.preventDefault();
		onIntent(intent);
	}

	target.addEventListener('keydown', onKeyDown as EventListener);
	return () =>
		target.removeEventListener('keydown', onKeyDown as EventListener);
}
