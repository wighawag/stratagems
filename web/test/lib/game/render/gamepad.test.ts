import {describe, expect, it, vi} from 'vitest';
import {
	attachGamepad,
	createGamepadRecognizer,
	snapshotOf,
	stickDirection,
	type GamepadSnapshot,
} from '$lib/game/render/gamepad';

/** A pad with every button up and both sticks centred, unless said otherwise. */
function pad(
	overrides: {
		index?: number;
		buttons?: Record<number, boolean>;
		axes?: readonly number[];
	} = {},
): GamepadSnapshot {
	const buttons: boolean[] = new Array(17).fill(false);
	for (const [index, value] of Object.entries(overrides.buttons ?? {})) {
		buttons[Number(index)] = value;
	}
	return {
		index: overrides.index ?? 0,
		buttons,
		axes: overrides.axes ?? [0, 0],
	};
}

describe('reading buttons off a pad', () => {
	it('reports a press once, on the frame it goes down', () => {
		// The whole reason this half exists: the browser offers a snapshot per
		// frame, not events, so a button held for a second is sixty frames of
		// "down" and exactly one press.
		const recognizer = createGamepadRecognizer();
		const held = pad({buttons: {0: true}});
		expect(recognizer.poll([held])).toEqual([{type: 'confirm'}]);
		expect(recognizer.poll([held])).toEqual([]);
		expect(recognizer.poll([pad()])).toEqual([]);
		expect(recognizer.poll([held])).toEqual([{type: 'confirm'}]);
	});

	it('maps the three face buttons and the d-pad', () => {
		const recognizer = createGamepadRecognizer();
		expect(recognizer.poll([pad({buttons: {1: true}})])).toEqual([
			{type: 'cancel'},
		]);
		expect(recognizer.poll([pad({buttons: {2: true}})])).toEqual([
			{type: 'secondary'},
		]);
		expect(recognizer.poll([pad({buttons: {12: true}})])).toEqual([
			{type: 'direction', direction: 'up'},
		]);
		expect(recognizer.poll([pad({buttons: {15: true}})])).toEqual([
			{type: 'direction', direction: 'right'},
		]);
	});

	it('survives a controller that reports fewer buttons than the standard one', () => {
		// The first named defect of the hand-written version: it read
		// `buttons[3].pressed` and `buttons[12..15]` unguarded, inside a
		// requestAnimationFrame callback, so such a pad threw every frame.
		const recognizer = createGamepadRecognizer();
		// One button, no d-pad, no sticks. The d-pad it does not have reports
		// nothing, and the button it does have still works: a short list, not a
		// broken pad.
		const sparse: GamepadSnapshot = {index: 0, buttons: [true], axes: []};
		expect(recognizer.poll([sparse])).toEqual([{type: 'confirm'}]);
		expect(recognizer.poll([{...sparse, buttons: [false]}])).toEqual([]);
	});

	it('keeps two pads apart', () => {
		const recognizer = createGamepadRecognizer();
		expect(
			recognizer.poll([pad({index: 0, buttons: {0: true}}), pad({index: 1})]),
		).toEqual([{type: 'confirm'}]);
		// The second pad pressing the same button is a different press, and a
		// single shared "was it down" set would swallow it.
		expect(
			recognizer.poll([
				pad({index: 0, buttons: {0: true}}),
				pad({index: 1, buttons: {0: true}}),
			]),
		).toEqual([{type: 'confirm'}]);
	});

	it('forgets a pad that goes away, because the index gets reused', () => {
		const recognizer = createGamepadRecognizer();
		recognizer.poll([pad({buttons: {0: true}})]);
		// Unplugged mid-press: `getGamepads` leaves an empty slot.
		expect(recognizer.poll([null])).toEqual([]);
		// A pad in that slot again, holding that button. It is a DIFFERENT device as
		// far as anything here can tell, so its button being down is a press. Keep
		// the old state and this is swallowed as "still held", which is how a second
		// player picking up the controller finds the confirm button dead.
		expect(recognizer.poll([pad({buttons: {0: true}})])).toEqual([
			{type: 'confirm'},
		]);
	});
});

describe('reading the stick', () => {
	it('needs a real push, and one push is one step', () => {
		const recognizer = createGamepadRecognizer();
		expect(recognizer.poll([pad({axes: [0.4, 0]})])).toEqual([]);
		expect(recognizer.poll([pad({axes: [0.9, 0]})])).toEqual([
			{type: 'direction', direction: 'right'},
		]);
		expect(recognizer.poll([pad({axes: [0.9, 0]})])).toEqual([]);
	});

	it('does not fire again until the stick comes back past the lower threshold', () => {
		// The reason there are two thresholds. A stick held near ONE of them wobbles
		// across it - fingers are not steady and sticks are not linear - and every
		// crossing would be another step, which on a three-move turn is the whole
		// turn spent by holding still.
		const recognizer = createGamepadRecognizer();
		expect(recognizer.poll([pad({axes: [0.9, 0]})])).toEqual([
			{type: 'direction', direction: 'right'},
		]);
		// Between the two thresholds: still pushed, so still the same push.
		expect(recognizer.poll([pad({axes: [0.45, 0]})])).toEqual([]);
		expect(recognizer.poll([pad({axes: [0.9, 0]})])).toEqual([]);
		// Back to the centre, and now it is a new push.
		expect(recognizer.poll([pad({axes: [0.1, 0]})])).toEqual([]);
		expect(recognizer.poll([pad({axes: [0.9, 0]})])).toEqual([
			{type: 'direction', direction: 'right'},
		]);
	});

	it('takes the dominant axis, so a diagonal is one direction', () => {
		expect(stickDirection(0.9, 0.7, false)).toBe('right');
		expect(stickDirection(0.7, -0.9, false)).toBe('up');
		expect(stickDirection(-0.9, 0.1, false)).toBe('left');
		expect(stickDirection(0, 0.9, false)).toBe('down');
	});

	it('reads a roll from one direction to another as a new push', () => {
		const recognizer = createGamepadRecognizer();
		recognizer.poll([pad({axes: [0.9, 0]})]);
		expect(recognizer.poll([pad({axes: [0, -0.9]})])).toEqual([
			{type: 'direction', direction: 'up'},
		]);
	});

	it('reads an axis a pad does not report as centred', () => {
		const recognizer = createGamepadRecognizer();
		expect(recognizer.poll([{index: 0, buttons: [], axes: []}])).toEqual([]);
	});

	it('reads a nonsense axis value as centred rather than as a push', () => {
		// NaN compares false against everything, so it does not merely fail to
		// register: it poisons the comparison that decides WHICH axis won. A stick
		// pushed hard right, on a pad reporting a broken vertical axis, comes out as
		// "down" - a step in a direction the player did not choose.
		const recognizer = createGamepadRecognizer();
		expect(
			recognizer.poll([{index: 0, buttons: [], axes: [0.9, NaN]}]),
		).toEqual([{type: 'direction', direction: 'right'}]);
	});
});

describe('flattening a real pad', () => {
	it('takes only pressed and the axis values, guarding a hole in either', () => {
		expect(
			snapshotOf({
				index: 3,
				buttons: [{pressed: true}, undefined, {pressed: false}],
				axes: [0.5, -0.5],
			}),
		).toEqual({index: 3, buttons: [true, false, false], axes: [0.5, -0.5]});
	});
});

/** The same pad in the shape the browser hands out, for the loop tests. */
function devicePad(snapshot: GamepadSnapshot) {
	return {
		index: snapshot.index,
		buttons: snapshot.buttons.map((down) => ({pressed: down === true})),
		axes: snapshot.axes.map((value) => value ?? 0),
	};
}

describe('the polling loop', () => {
	/** A fake frame scheduler, so the loop can be stepped one frame at a time. */
	function scheduler() {
		// A QUEUE rather than one slot, so "two loops are running" is visible here.
		// With a single slot a second loop overwrites the first and the fake makes
		// the bug it is meant to catch impossible to see.
		let queued: (() => void)[] = [];
		let handle = 0;
		const cancelled: number[] = [];
		return {
			cancelled,
			requestFrame: (callback: () => void) => {
				queued.push(callback);
				return ++handle;
			},
			cancelFrame: (h: number) => cancelled.push(h),
			/** Run every frame that was pending when this was called. */
			step() {
				const callbacks = queued;
				queued = [];
				for (const callback of callbacks) callback();
			},
			get pending() {
				return queued.length > 0;
			},
			get pendingCount() {
				return queued.length;
			},
		};
	}

	function host() {
		const listeners = new Map<string, Set<() => void>>();
		return {
			addEventListener: (type: string, listener: () => void) => {
				(listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(
					listener,
				);
			},
			removeEventListener: (type: string, listener: () => void) => {
				listeners.get(type)?.delete(listener);
			},
			emit(type: string) {
				for (const listener of listeners.get(type) ?? []) listener();
			},
			count(type: string) {
				return listeners.get(type)?.size ?? 0;
			},
		};
	}

	it('does not poll at all until a pad turns up', () => {
		const frames = scheduler();
		const pads: (ReturnType<typeof devicePad> | null)[] = [];
		const stop = attachGamepad(() => {}, {
			host: host(),
			getGamepads: () => pads,
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
		});
		expect(frames.pending).toBe(false);
		stop();
	});

	it('polls once connected, and reports what is pressed', () => {
		const frames = scheduler();
		const window = host();
		const pads: (ReturnType<typeof devicePad> | null)[] = [];
		const seen = vi.fn();
		const stop = attachGamepad(seen, {
			host: window,
			getGamepads: () => pads,
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
		});

		pads.push(devicePad(pad({buttons: {0: true}})));
		window.emit('gamepadconnected');
		frames.step();
		expect(seen).toHaveBeenCalledWith({type: 'confirm'});
		stop();
	});

	it('runs ONE loop however many times it is told a pad connected', () => {
		// The second named defect: that version's `start()` re-added its window
		// listeners on every call and its loop stopped only on a flag, so two
		// starts ran two loops and every press arrived twice.
		const frames = scheduler();
		const window = host();
		const pads = [devicePad(pad({buttons: {0: true}}))];
		const seen = vi.fn();
		const stop = attachGamepad(seen, {
			host: window,
			getGamepads: () => pads,
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
		});

		window.emit('gamepadconnected');
		window.emit('gamepadconnected');
		window.emit('gamepadconnected');
		// The assertion is the FRAME COUNT, not the intent count: a second loop is
		// invisible in the intents, because the recogniser's edge detection makes
		// the duplicate poll report nothing. It shows up as gas - two polls, two
		// frames, forever - and as a teardown that only stops one of them.
		expect(frames.pendingCount).toBe(1);
		frames.step();
		expect(seen).toHaveBeenCalledTimes(1);
		expect(frames.pendingCount).toBe(1);
		stop();
	});

	it('stops polling when the last pad goes away, and starts again when it returns', () => {
		const frames = scheduler();
		const window = host();
		let pads: (ReturnType<typeof devicePad> | null)[] = [devicePad(pad())];
		const seen = vi.fn();
		const stop = attachGamepad(seen, {
			host: window,
			getGamepads: () => pads,
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
		});

		expect(frames.pending).toBe(true);
		pads = [];
		frames.step();
		expect(frames.pending).toBe(false);

		pads = [devicePad(pad({buttons: {0: true}}))];
		window.emit('gamepadconnected');
		frames.step();
		expect(seen).toHaveBeenCalledWith({type: 'confirm'});
		stop();
	});

	it('lets go of the frame and the listener when it is torn down', () => {
		const frames = scheduler();
		const window = host();
		const seen = vi.fn();
		const stop = attachGamepad(seen, {
			host: window,
			// Holding a button, so a frame that runs after the teardown has something
			// to report and the assertion below is not vacuous.
			getGamepads: () => [devicePad(pad({buttons: {0: true}}))],
			requestFrame: frames.requestFrame,
			cancelFrame: frames.cancelFrame,
		});
		expect(window.count('gamepadconnected')).toBe(1);

		stop();
		expect(window.count('gamepadconnected')).toBe(0);
		expect(frames.cancelled).toHaveLength(1);
		// Cancelling a frame is a request, not a guarantee: one already dispatched
		// still runs. It must report nothing, because the game it would report to
		// has gone - this is the browser half of "a teardown means torn down".
		frames.step();
		expect(seen).not.toHaveBeenCalled();
	});

	it('does nothing where there is no gamepad API', () => {
		// The server, and browsers without one. A game whose controls are mostly a
		// pointer must not fail to start because of a device nobody has.
		expect(() => attachGamepad(() => {}, {host: host()})()).not.toThrow();
	});
});

describe('buttons a game binds to actions of its own', () => {
	it('carries a bound button to the game once per press, under its name', () => {
		const recognizer = createGamepadRecognizer({3: 'delayedBomb'});
		const held = pad({buttons: {3: true}});
		expect(recognizer.poll([held])).toEqual([
			{type: 'action', name: 'delayedBomb'},
		]);
		expect(recognizer.poll([held])).toEqual([]);
		// unbound, the north button is nobody's
		expect(createGamepadRecognizer().poll([held])).toEqual([]);
	});

	it('lets the game take a default button back, and leaves the rest alone', () => {
		const recognizer = createGamepadRecognizer({2: 'drop'});
		expect(recognizer.poll([pad({buttons: {2: true}})])).toEqual([
			{type: 'action', name: 'drop'},
		]);
		expect(recognizer.poll([pad({buttons: {0: true}})])).toEqual([
			{type: 'confirm'},
		]);
	});

	it('passes the binding through the DOM half', () => {
		let frame: (() => void) | undefined;
		const seen: unknown[] = [];
		const pads = [
			{
				index: 0,
				buttons: [3].reduce(
					(b, i) => ((b[i] = {pressed: true}), b),
					new Array(17).fill({pressed: false}),
				),
				axes: [0, 0],
			},
		];
		const stop = attachGamepad((intent) => seen.push(intent), {
			host: {addEventListener: () => {}, removeEventListener: () => {}},
			getGamepads: () => pads,
			requestFrame: (callback) => ((frame = callback), 1),
			cancelFrame: () => {},
			actions: {3: 'delayedBomb'},
		});
		frame?.();
		expect(seen).toEqual([{type: 'action', name: 'delayedBomb'}]);
		stop();
	});
});
