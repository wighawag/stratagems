/**
 * Which gem's owner the board lights and the card describes (step 9, P9-5):
 * the gem the pointer is over, or the one last tapped, which holds until
 * another tap. Written by the renderer, read by the board and the HUD's card.
 *
 * Hover goes through `hoverStep` (`./look.ts`), so crossing the gap between two
 * gems never lets go, and the store only fires when the focused key changes.
 */
import {derived, writable, type Readable} from 'svelte/store';
import {hoverStep, type HoverState} from './look';

export type FocusStore = Readable<string | undefined> & {
	/** The pointer is over the cell `key` holds a gem at, or over none. */
	hover(key: string | undefined, at: number): void;
	/** A tap: pin `key`, or unpin with undefined (or a tap on the pinned gem). */
	tap(key: string | undefined): void;
	/** Time passes: lets a hover go once its grace is over. */
	tick(at: number): void;
	clear(): void;
};

export function createFocus(): FocusStore {
	const hovered = writable<HoverState>({});
	const pinned = writable<string | undefined>(undefined);
	let hoverState: HoverState = {};
	let pinnedKey: string | undefined;

	function step(next: HoverState) {
		if (next === hoverState) return;
		hoverState = next;
		hovered.set(next);
	}

	const focused = derived(
		[hovered, pinned],
		([$hovered, $pinned]) => $pinned ?? $hovered.key,
	);
	// derived fires on every input change; only pass a CHANGE of key on
	const key = derived<typeof focused, string | undefined>(
		focused,
		($focused, set) => set($focused),
		undefined,
	);

	return {
		subscribe: key.subscribe,
		hover(cell, at) {
			step(
				hoverStep(
					hoverState,
					cell === undefined
						? {type: 'leave', at}
						: {type: 'enter', key: cell, at},
				),
			);
		},
		tap(cell) {
			pinnedKey = cell === undefined || cell === pinnedKey ? undefined : cell;
			pinned.set(pinnedKey);
		},
		tick(at) {
			step(hoverStep(hoverState, {type: 'tick', at}));
		},
		clear() {
			pinnedKey = undefined;
			pinned.set(undefined);
			step({});
		},
	};
}
