/**
 * Gamepad to intents.
 *
 * Same two halves as `keys.ts` and as `gestures.ts`:
 * {@link createGamepadRecognizer} is a state machine over plain numbers, and
 * {@link attachGamepad} is the polling loop that feeds it. A gamepad has no
 * events for its buttons - the browser only offers a snapshot per frame - so
 * the edge detection ("this button is newly down") is the recogniser's whole
 * job, and it is exactly the part that is impossible to test through a DOM.
 *
 * THE DEFECTS THIS DOES NOT REPRODUCE, both from a hand-written version in a
 * game built on this template:
 *
 * - it read `gamepad.buttons[3].pressed` unguarded and assumed
 *   `buttons[12..15]` exist. A controller reporting fewer buttons threw inside
 *   a `requestAnimationFrame` callback, every frame. Every read here goes
 *   through {@link pressed}, which answers false for a button that is not
 *   there.
 * - its `start()` re-added the window listeners on each call and stopped its
 *   loop only through a `running` flag, so a second `start()` before the first
 *   loop noticed ran two loops. There is no `start()` here: attaching returns
 *   its own teardown and owns its own frame handle, so two attachments are two
 *   independent bindings and one teardown cannot half-stop the other.
 *
 * The loop also does not run at all until a pad announces itself. A player
 * with no gamepad - most of them - should not be paying for a
 * `requestAnimationFrame` every frame for a device that is not there, and
 * `getGamepads` reports nothing until the browser has seen a button press
 * anyway, which is the same moment `gamepadconnected` fires.
 */
import type {ControlIntent, ControlIntentHandler, Direction} from './intents';

/**
 * One pad, as much of it as the recogniser needs.
 *
 * `index` is `Gamepad.index`, which is stable while the pad stays connected and
 * is what lets two pads be told apart. Both arrays may be SHORT, or hold
 * undefined: that is the whole point of the type being this loose.
 */
export type GamepadSnapshot = {
	index: number;
	buttons: readonly (boolean | undefined)[];
	axes: readonly (number | undefined)[];
};

/**
 * The standard mapping, which is the only one a browser reports as `standard`.
 *
 * Buttons are read by position because that is all the API offers. A pad that
 * reports a different layout will map them differently, and the guarded reads
 * mean the worst case is a button that does nothing rather than a throw.
 */
const BUTTON_INTENTS: readonly [number, ControlIntent][] = [
	/** South (A on an Xbox pad, cross on a PlayStation one). */
	[0, {type: 'confirm'}],
	/** East (B, circle). */
	[1, {type: 'cancel'}],
	/** West (X, square). */
	[2, {type: 'secondary'}],
];

const DPAD_INTENTS: readonly [number, Direction][] = [
	[12, 'up'],
	[13, 'down'],
	[14, 'left'],
	[15, 'right'],
];

/**
 * How far the stick must go to count, and how far back it must come to count
 * again.
 *
 * Two thresholds rather than one, because a stick held near a single threshold
 * jitters across it and would fire a burst of steps. The gap is what makes one
 * push one step.
 */
const STICK_ENGAGE = 0.6;
const STICK_RELEASE = 0.35;

function pressed(
	buttons: readonly (boolean | undefined)[],
	index: number,
): boolean {
	return buttons[index] === true;
}

function axis(axes: readonly (number | undefined)[], index: number): number {
	const value = axes[index];
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Which way the stick is pushed, or undefined for a stick near the centre.
 *
 * ONE DIRECTION AT A TIME, the dominant axis. A stick pushed diagonally is a
 * player aiming at one of the four, not asking for two steps at once, and on a
 * board where a turn is a handful of moves the difference is the whole turn.
 */
export function stickDirection(
	x: number,
	y: number,
	engaged: boolean,
): Direction | undefined {
	const threshold = engaged ? STICK_RELEASE : STICK_ENGAGE;
	const [ax, ay] = [Math.abs(x), Math.abs(y)];
	if (Math.max(ax, ay) < threshold) return undefined;
	if (ax >= ay) return x < 0 ? 'left' : 'right';
	// Negative is UP on every reported axis, which is also how the board stores
	// its coordinates; the translation to a delta is the game's.
	return y < 0 ? 'up' : 'down';
}

type PadState = {
	/** Buttons that were down at the previous poll, for the rising edge. */
	down: Set<number>;
	/** Which way the stick was last reported as pushed. */
	stick: Direction | undefined;
};

export type GamepadRecognizer = {
	/**
	 * Read one frame of pads and return what has just been pressed.
	 *
	 * Takes the whole list, including the empty slots `navigator.getGamepads()`
	 * leaves for disconnected pads, because the LIST is what says which pads
	 * still exist. A pad that has gone away has its state dropped, and that is
	 * about the INDEX rather than about the pad: the browser reuses it, so a
	 * different controller plugged into the same slot would otherwise inherit
	 * whichever buttons the old one was last seen holding, and its own first
	 * press of one of them would be swallowed as "still down".
	 */
	poll(pads: readonly (GamepadSnapshot | null | undefined)[]): ControlIntent[];
	/** Forget every pad, for a binding that is going away. */
	reset(): void;
};

/**
 * Buttons the GAME binds to actions of its own, by standard-mapping index (3 is
 * the north face button, 4 and 5 the bumpers, 6 and 7 the triggers), to the name
 * it will receive in `{type: 'action', name}`. Consulted before the defaults, so
 * binding 0, 1 or 2 takes that button back from `confirm`, `cancel` or
 * `secondary`.
 */
export type GamepadActions = Readonly<Record<number, string>>;

export function createGamepadRecognizer(
	actions: GamepadActions = {},
): GamepadRecognizer {
	const bound: readonly [number, ControlIntent][] = [
		...Object.entries(actions).map(([index, name]): [number, ControlIntent] => [
			Number(index),
			{type: 'action', name},
		]),
		...BUTTON_INTENTS.filter(([index]) => !(index in actions)),
	];

	const states = new Map<number, PadState>();

	return {
		poll(pads) {
			const intents: ControlIntent[] = [];
			const seen = new Set<number>();

			for (const pad of pads) {
				if (!pad) continue;
				seen.add(pad.index);
				const previous = states.get(pad.index) ?? {
					down: new Set<number>(),
					stick: undefined,
				};
				const down = new Set<number>();

				for (const [index, intent] of bound) {
					if (!pressed(pad.buttons, index)) continue;
					down.add(index);
					if (!previous.down.has(index)) intents.push(intent);
				}
				for (const [index, direction] of DPAD_INTENTS) {
					if (!pressed(pad.buttons, index)) continue;
					down.add(index);
					if (!previous.down.has(index)) {
						intents.push({type: 'direction', direction});
					}
				}

				const stick = stickDirection(
					axis(pad.axes, 0),
					axis(pad.axes, 1),
					previous.stick !== undefined,
				);
				// A CHANGE of direction is a new push, not a continuation: pushing
				// left and then rolling to up without passing the centre means both.
				if (stick && stick !== previous.stick) {
					intents.push({type: 'direction', direction: stick});
				}

				states.set(pad.index, {down, stick});
			}

			for (const index of [...states.keys()]) {
				if (!seen.has(index)) states.delete(index);
			}

			return intents;
		},

		reset() {
			states.clear();
		},
	};
}

/** The parts of a real `Gamepad` this reads, structurally. */
type GamepadLike = {
	index: number;
	buttons: ArrayLike<{pressed: boolean} | undefined>;
	axes: ArrayLike<number>;
};

/** The parts of `window` this needs, so a test can hand it something else. */
type GamepadHost = {
	addEventListener(type: string, listener: () => void): void;
	removeEventListener(type: string, listener: () => void): void;
};

export type GamepadOptions = {
	host?: GamepadHost;
	getGamepads?: () => ArrayLike<GamepadLike | null>;
	requestFrame?: (callback: () => void) => number;
	cancelFrame?: (handle: number) => void;
	/** The game's own buttons: see {@link GamepadActions}. */
	actions?: GamepadActions;
};

/** One frame of a real pad, flattened into what the recogniser reads. */
export function snapshotOf(pad: GamepadLike): GamepadSnapshot {
	const buttons: (boolean | undefined)[] = [];
	for (let i = 0; i < pad.buttons.length; i++) {
		buttons.push(pad.buttons[i]?.pressed === true);
	}
	const axes: number[] = [];
	for (let i = 0; i < pad.axes.length; i++) axes.push(pad.axes[i]);
	return {index: pad.index, buttons, axes};
}

/**
 * Poll for gamepad input while one is connected. Returns the teardown.
 *
 * Silently does nothing where there is no gamepad API at all, which includes
 * the server: a caller should not have to ask, and a game whose controls are
 * primarily a pointer and a keyboard must not fail to start because a browser
 * has no `getGamepads`.
 */
export function attachGamepad(
	onIntent: ControlIntentHandler,
	options: GamepadOptions = {},
): () => void {
	const host =
		options.host ?? (typeof window === 'undefined' ? undefined : window);
	const getGamepads =
		options.getGamepads ??
		(typeof navigator === 'undefined' || !navigator.getGamepads
			? undefined
			: () => navigator.getGamepads() as ArrayLike<GamepadLike | null>);
	const requestFrame =
		options.requestFrame ??
		(typeof requestAnimationFrame === 'undefined'
			? undefined
			: (callback: () => void) => requestAnimationFrame(() => callback()));
	const cancelFrame =
		options.cancelFrame ??
		(typeof cancelAnimationFrame === 'undefined'
			? undefined
			: (handle: number) => cancelAnimationFrame(handle));

	if (!host || !getGamepads || !requestFrame || !cancelFrame) return () => {};

	const recognizer = createGamepadRecognizer(options.actions);
	let frame: number | undefined;
	let stopped = false;

	function readPads(): GamepadSnapshot[] {
		const pads = getGamepads!();
		const snapshots: GamepadSnapshot[] = [];
		for (let i = 0; i < pads.length; i++) {
			const pad = pads[i];
			if (pad) snapshots.push(snapshotOf(pad));
		}
		return snapshots;
	}

	function tick() {
		frame = undefined;
		if (stopped) return;
		const pads = readPads();
		if (pads.length === 0) {
			// The last pad went away. Stop rather than spin: `gamepadconnected`
			// starts this again, and a loop nobody is feeding is the one cost this
			// module can avoid entirely.
			recognizer.reset();
			return;
		}
		for (const intent of recognizer.poll(pads)) onIntent(intent);
		schedule();
	}

	function schedule() {
		// The single guard that makes starting IDEMPOTENT: a connect event while
		// the loop is already running is a no-op rather than a second loop.
		if (stopped || frame !== undefined) return;
		frame = requestFrame!(tick);
	}

	const onConnected = () => schedule();
	host.addEventListener('gamepadconnected', onConnected);
	// A pad may already be connected when this binds - navigating between routes,
	// or a player who pressed a button before the game was on screen.
	if (readPads().length > 0) schedule();

	return () => {
		stopped = true;
		host.removeEventListener('gamepadconnected', onConnected);
		if (frame !== undefined) cancelFrame!(frame);
		frame = undefined;
		recognizer.reset();
	};
}
