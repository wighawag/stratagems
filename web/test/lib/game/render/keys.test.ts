import {describe, expect, it} from 'vitest';
import {recognizeKey} from '$lib/game/render/keys';

/**
 * The pure half. What is worth pinning is not the table (a typo in it is
 * visible) but the four REFUSALS, every one of which is a defect a
 * hand-written keyboard controller shipped or would have shipped.
 */
describe('the keys a board game uses', () => {
	it('reads the arrows and WASD as the same four directions', () => {
		expect(recognizeKey({key: 'ArrowUp'})).toEqual({
			type: 'direction',
			direction: 'up',
		});
		expect(recognizeKey({key: 'w'})).toEqual(recognizeKey({key: 'ArrowUp'}));
		expect(recognizeKey({key: 'S'})).toEqual(recognizeKey({key: 'ArrowDown'}));
		expect(recognizeKey({key: 'a'})).toEqual(recognizeKey({key: 'ArrowLeft'}));
		expect(recognizeKey({key: 'D'})).toEqual(recognizeKey({key: 'ArrowRight'}));
	});

	it('names the three actions', () => {
		expect(recognizeKey({key: 'Enter'})).toEqual({type: 'confirm'});
		expect(recognizeKey({key: ' '})).toEqual({type: 'secondary'});
		expect(recognizeKey({key: 'Backspace'})).toEqual({type: 'cancel'});
	});

	it('has nothing to say about a key it does not use', () => {
		// Load-bearing: the DOM half only calls `preventDefault` when an intent
		// comes back, so a key that is not ours has to answer undefined rather than
		// some do-nothing intent, or the game silently swallows Tab and F5.
		expect(recognizeKey({key: 'Tab'})).toBeUndefined();
		expect(recognizeKey({key: 'q'})).toBeUndefined();
	});
});

describe('the keystrokes it deliberately does not take', () => {
	it('leaves a chord to whoever owns the shortcut', () => {
		// Ctrl+W closes the tab, Alt+Left goes back, Cmd+A selects everything.
		// Answering the bare letter and the chord alike makes the game fight the
		// browser, and the player loses a turn to a keystroke they aimed elsewhere.
		expect(recognizeKey({key: 'w', modified: true})).toBeUndefined();
		expect(recognizeKey({key: 'ArrowLeft', modified: true})).toBeUndefined();
	});

	it('leaves every key to a field the player is typing in', () => {
		// The defect a hand-written controller shipped: it bound to `document`
		// with no check at all, so arrows and space acted on the board while the
		// player typed in a modal. The arrows count - they move a caret.
		expect(recognizeKey({key: 'ArrowUp', intoText: true})).toBeUndefined();
		expect(recognizeKey({key: ' ', intoText: true})).toBeUndefined();
		expect(recognizeKey({key: 'x', intoText: true})).toBeUndefined();
	});

	it('leaves a focused control the two keys that press it, and no more', () => {
		// A button already acts on Enter and Space, so answering them here makes one
		// press do two things.
		expect(recognizeKey({key: 'Enter', intoControl: true})).toBeUndefined();
		expect(recognizeKey({key: ' ', intoControl: true})).toBeUndefined();
		// But it has no use for the arrows, and this is not hypothetical: pressing
		// the on-screen d-pad with a mouse leaves that button focused, so a blanket
		// rule would make the keyboard stop working with nothing to explain why.
		expect(recognizeKey({key: 'ArrowUp', intoControl: true})).toEqual({
			type: 'direction',
			direction: 'up',
		});
	});

	it('does not repeat a held key, unless asked to', () => {
		// A turn is a handful of moves. Auto-repeat at thirty a second spends all
		// of them before a finger comes off the key.
		expect(recognizeKey({key: 'ArrowUp', repeat: true})).toBeUndefined();
		expect(
			recognizeKey({key: 'ArrowUp', repeat: true}, {repeats: true}),
		).toEqual({type: 'direction', direction: 'up'});
	});

	it('still answers the first press of a key that goes on to repeat', () => {
		expect(recognizeKey({key: 'ArrowUp', repeat: false})).toEqual({
			type: 'direction',
			direction: 'up',
		});
	});
});

describe('the actions a game names for itself', () => {
	const actions = {b: 'delayedBomb', x: 'drop'};

	it('carries a bound key to the game, under the name the game gave it', () => {
		expect(recognizeKey({key: 'b'}, {actions})).toEqual({
			type: 'action',
			name: 'delayedBomb',
		});
		// unbound, the same key is still nobody's
		expect(recognizeKey({key: 'b'})).toBeUndefined();
	});

	it('lets the game take a default key back', () => {
		// `x` is a spelling of `secondary` by default; bound, it is the game's.
		expect(recognizeKey({key: 'x'})).toEqual({type: 'secondary'});
		expect(recognizeKey({key: 'x'}, {actions})).toEqual({
			type: 'action',
			name: 'drop',
		});
		// and every other default is untouched
		expect(recognizeKey({key: 'Enter'}, {actions})).toEqual({type: 'confirm'});
	});

	it('refuses a bound key exactly where it refuses every other key', () => {
		expect(recognizeKey({key: 'b', intoText: true}, {actions})).toBeUndefined();
		expect(recognizeKey({key: 'b', modified: true}, {actions})).toBeUndefined();
		expect(recognizeKey({key: 'b', repeat: true}, {actions})).toBeUndefined();
		expect(
			recognizeKey({key: 'b', repeat: true}, {actions, repeats: true}),
		).toEqual({type: 'action', name: 'delayedBomb'});
		// Enter and Space into a focused control still belong to the control,
		// even when the game has bound them.
		expect(
			recognizeKey({key: ' ', intoControl: true}, {actions: {' ': 'bomb'}}),
		).toBeUndefined();
	});
});
