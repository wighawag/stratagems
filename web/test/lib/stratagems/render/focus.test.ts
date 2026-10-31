import {describe, it, expect} from 'vitest';
import {get} from 'svelte/store';
import {createFocus} from '$lib/stratagems/render/focus';
import {HOVER_GRACE_MS} from '$lib/stratagems/render/look';

describe('the focus', () => {
	it('follows the hovered gem, keeping it through a short gap', () => {
		const focus = createFocus();
		focus.hover('a', 0);
		expect(get(focus)).toBe('a');
		focus.hover(undefined, 10);
		focus.tick(10 + HOVER_GRACE_MS - 1);
		expect(get(focus)).toBe('a');
		focus.hover('b', 20 + HOVER_GRACE_MS);
		expect(get(focus)).toBe('b');
		focus.hover(undefined, 1000);
		focus.tick(1000 + HOVER_GRACE_MS);
		expect(get(focus)).toBeUndefined();
	});

	it('holds a tapped gem over any hover, until tapped again or elsewhere', () => {
		const focus = createFocus();
		focus.tap('a');
		focus.hover('b', 0);
		expect(get(focus)).toBe('a');
		focus.tap('a');
		expect(get(focus)).toBe('b');
		focus.tap('c');
		focus.tap(undefined);
		expect(get(focus)).toBe('b');
		focus.clear();
		expect(get(focus)).toBeUndefined();
	});

	it('fires only when the focused gem changes', () => {
		const focus = createFocus();
		const seen: (string | undefined)[] = [];
		const stop = focus.subscribe((key) => seen.push(key));
		focus.hover('a', 0);
		focus.hover('a', 1);
		focus.hover(undefined, 2);
		focus.tick(3);
		focus.hover('a', 4);
		stop();
		expect(seen).toEqual([undefined, 'a']);
	});
});
