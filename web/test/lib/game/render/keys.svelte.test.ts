import {afterEach, describe, expect, it} from 'vitest';
import {attachKeys} from '$lib/game/render/keys';
import type {ControlIntent} from '$lib/game/render/intents';

/**
 * The DOM half, against real elements and real keyboard events.
 *
 * In the browser project because everything it decides is a DOM question:
 * where the keystroke was aimed, and whether the page still gets to scroll.
 * `recognizeKey` is tested next door with no DOM at all.
 */

let cleanup: (() => void)[] = [];

afterEach(() => {
	for (const fn of cleanup) fn();
	cleanup = [];
	document.body.innerHTML = '';
});

function listening() {
	const intents: ControlIntent[] = [];
	cleanup.push(attachKeys(document, (intent) => intents.push(intent)));
	return intents;
}

function press(target: EventTarget, key: string): KeyboardEvent {
	const event = new KeyboardEvent('keydown', {
		key,
		bubbles: true,
		cancelable: true,
	});
	target.dispatchEvent(event);
	return event;
}

describe('a keyboard bound to the document', () => {
	it('turns a keystroke aimed at nothing in particular into an intent', () => {
		const intents = listening();
		press(document.body, 'ArrowUp');
		expect(intents).toEqual([{type: 'direction', direction: 'up'}]);
	});

	it('stops the page scrolling out from under the board', () => {
		// Arrows and space scroll. A board that jumps a screen down on every step
		// is unplayable, and this is the only place that can prevent it.
		const intents = listening();
		expect(press(document.body, 'ArrowDown').defaultPrevented).toBe(true);
		expect(press(document.body, ' ').defaultPrevented).toBe(true);
		expect(intents).toHaveLength(2);
	});

	it('leaves a key it does not use entirely alone', () => {
		// Not a detail: swallowing Tab would trap keyboard navigation on the board,
		// and swallowing F5 or Ctrl+R would break reloading the page.
		const intents = listening();
		expect(press(document.body, 'Tab').defaultPrevented).toBe(false);
		expect(intents).toHaveLength(0);
	});

	it('leaves a focused button the keys that press it, and keeps the arrows', () => {
		// A focused button already acts on Space and Enter; answering them here as
		// well makes one press do two things. The arrows are the other half of the
		// rule and matter just as much: pressing the on-screen d-pad with a mouse
		// leaves its button focused, and a blanket rule would kill the keyboard
		// from then on.
		const intents = listening();
		const button = document.createElement('button');
		document.body.appendChild(button);
		expect(press(button, ' ').defaultPrevented).toBe(false);
		expect(press(button, 'Enter').defaultPrevented).toBe(false);
		expect(intents).toHaveLength(0);

		expect(press(button, 'ArrowLeft').defaultPrevented).toBe(true);
		expect(intents).toEqual([{type: 'direction', direction: 'left'}]);
	});

	it('recognises a control by ancestry, not just by what was clicked', () => {
		// Focus lands on the element; the event target can be a child of it. A
		// check on the target's own tag misses the span inside the button.
		const intents = listening();
		const button = document.createElement('button');
		const label = document.createElement('span');
		button.appendChild(label);
		document.body.appendChild(button);
		press(label, 'Enter');
		expect(intents).toHaveLength(0);
	});

	it('keeps its hands off a text field, arrows included', () => {
		const intents = listening();
		const input = document.createElement('input');
		document.body.appendChild(input);
		press(input, 'a');
		press(input, ' ');
		expect(press(input, 'ArrowLeft').defaultPrevented).toBe(false);
		expect(intents).toHaveLength(0);
	});

	it('stops listening when it is torn down', () => {
		const intents: ControlIntent[] = [];
		const stop = attachKeys(document, (intent) => intents.push(intent));
		press(document.body, 'ArrowUp');
		stop();
		press(document.body, 'ArrowUp');
		expect(intents).toHaveLength(1);
	});
});
