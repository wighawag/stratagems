import {describe, expect, it} from 'vitest';
import {writable} from 'svelte/store';
import type {Frame, ViewStateStore, ViewStateValue} from '$lib/game/core/seams';
import {createStatefulRenderer} from '$lib/game/render/stateful';
import {createImmediateRenderer} from '$lib/game/render/immediate';

type Cell = {stake: number};
type View = {cells: Map<string, Cell>};

function makeViewState() {
	const store = writable<ViewStateValue<View>>({step: 'Unloaded'});
	const viewState: ViewStateStore<View> = {
		subscribe: store.subscribe,
		status: writable({loading: false}),
	};
	return {store, viewState};
}

const frame: Frame = {
	timeMs: 0,
	deltaMs: 16,
	transform: {centerX: 0, centerY: 0, scale: 10},
	screen: {width: 100, height: 100},
	devicePixelRatio: 1,
};

describe('createStatefulRenderer', () => {
	function setup() {
		const {store, viewState} = makeViewState();
		const log: string[] = [];
		const surface = {name: 'surface'};

		const renderer = createStatefulRenderer<
			typeof surface,
			View,
			string,
			Cell,
			{key: string}
		>({
			viewState,
			entities: (view) => view.cells,
			changed: (a, b) => a.stake !== b.stake,
			add: ({key, surface: given}) => {
				expect(given).toBe(surface);
				log.push(`add ${key}`);
				return {key};
			},
			update: ({key}) => log.push(`update ${key}`),
			remove: ({key}) => log.push(`remove ${key}`),
			onCycleChanged: ({cycleNumber, previousCycleNumber}) =>
				log.push(`cycle ${previousCycleNumber} -> ${cycleNumber}`),
			onStopped: () => log.push('stopped'),
		});

		return {store, log, surface, renderer};
	}

	it('hands tick the live objects, which is what per-object animation needs', () => {
		// The README recommends this style for "anything with per-object
		// animation", and `tick` used to receive only the frame and the surface.
		// A renderer therefore had to keep its own parallel collection, filled in
		// `add` and emptied in `remove`, to have anything to animate - a second
		// source of truth that is wrong exactly when a handler throws or a key is
		// re-added, and silent when it is wrong.
		const {store, surface, renderer} = setup();
		const seen: string[][] = [];
		const withTick = createStatefulRenderer<
			typeof surface,
			View,
			string,
			Cell,
			{key: string}
		>({
			viewState: {
				subscribe: store.subscribe,
				status: writable({loading: false}),
			},
			entities: (view) => view.cells,
			add: ({key}) => ({key}),
			update: () => {},
			remove: () => {},
			tick: ({objects}) => seen.push([...objects].map((o) => o.key)),
		});
		void renderer;

		withTick.onAppStarted(surface);
		store.set({
			step: 'Loaded',
			cycleNumber: 1,
			cells: new Map([
				['a', {stake: 1}],
				['b', {stake: 1}],
			]),
		});
		withTick.tick(frame);
		expect(seen).toEqual([['a', 'b']]);

		// And it follows the scene rather than a snapshot taken once: an entity
		// the state dropped stops being animated.
		store.set({
			step: 'Loaded',
			cycleNumber: 1,
			cells: new Map([['b', {stake: 1}]]),
		});
		withTick.tick(frame);
		expect(seen[1]).toEqual(['b']);

		// After teardown there is nothing live, so nothing to animate.
		withTick.onAppStopped();
		withTick.tick(frame);
		expect(seen.length).toBe(2);
	});

	it('mirrors the view state into the scene', () => {
		const {store, log, surface, renderer} = setup();
		renderer.onAppStarted(surface);

		store.set({
			step: 'Loaded',
			cycleNumber: 1,
			cells: new Map([['a', {stake: 1}]]),
		});
		expect(log).toEqual(['cycle undefined -> 1', 'add a']);

		log.length = 0;
		store.set({
			step: 'Loaded',
			cycleNumber: 1,
			cells: new Map([['a', {stake: 2}]]),
		});
		expect(log).toEqual(['update a']);

		log.length = 0;
		store.set({step: 'Loaded', cycleNumber: 1, cells: new Map()});
		expect(log).toEqual(['remove a']);
	});

	/**
	 * The signal a commit-reveal game needs and an ordinary one does not:
	 * everything drawn from local intent is scoped to one cycle. Fired BEFORE the
	 * new cycle's entities are applied, so a renderer can drop the old overlay
	 * without racing what replaces it.
	 */
	it('announces a cycle change before applying that cycle', () => {
		const {store, log, surface, renderer} = setup();
		renderer.onAppStarted(surface);
		store.set({step: 'Loaded', cycleNumber: 1, cells: new Map()});
		log.length = 0;
		store.set({
			step: 'Loaded',
			cycleNumber: 2,
			cells: new Map([['a', {stake: 1}]]),
		});
		expect(log).toEqual(['cycle 1 -> 2', 'add a']);
	});

	/**
	 * State going back to Unloaded means what is on screen is no longer known to
	 * be true (an account switch, a chain reset). Leaving it there shows a board
	 * that belongs to nobody, and it reads as a rendering hiccup rather than a
	 * bug, which is how it survives.
	 */
	it('empties the scene when the state goes back to Unloaded', () => {
		const {store, log, surface, renderer} = setup();
		renderer.onAppStarted(surface);
		store.set({
			step: 'Loaded',
			cycleNumber: 1,
			cells: new Map([['a', {stake: 1}]]),
		});
		log.length = 0;

		store.set({step: 'Unloaded'});
		expect(log).toEqual(['remove a']);

		// And the cycle is forgotten with it, so reloading the same cycle is
		// announced again rather than being mistaken for "no change".
		log.length = 0;
		store.set({
			step: 'Loaded',
			cycleNumber: 1,
			cells: new Map([['a', {stake: 1}]]),
		});
		expect(log).toEqual(['cycle undefined -> 1', 'add a']);
	});

	/**
	 * On teardown the surface has already taken its children with it, so running
	 * remove handlers is at best wasted work and at worst an exception thrown
	 * during unmount. Resources the surface does not own are freed in onStopped.
	 */
	it('drops the scene on stop without running remove handlers', () => {
		const {store, log, surface, renderer} = setup();
		renderer.onAppStarted(surface);
		store.set({
			step: 'Loaded',
			cycleNumber: 1,
			cells: new Map([['a', {stake: 1}]]),
		});
		log.length = 0;

		renderer.onAppStopped();
		expect(log).toEqual(['stopped']);
	});

	it('stops listening to the view state once stopped', () => {
		const {store, log, surface, renderer} = setup();
		renderer.onAppStarted(surface);
		renderer.onAppStopped();
		log.length = 0;
		store.set({
			step: 'Loaded',
			cycleNumber: 9,
			cells: new Map([['a', {stake: 1}]]),
		});
		expect(log).toEqual([]);
	});

	it('reports what the last change was', () => {
		const {store, surface, renderer} = setup();
		renderer.onAppStarted(surface);
		store.set({
			step: 'Loaded',
			cycleNumber: 1,
			cells: new Map([
				['a', {stake: 1}],
				['b', {stake: 1}],
			]),
		});
		store.set({
			step: 'Loaded',
			cycleNumber: 1,
			cells: new Map([['a', {stake: 2}]]),
		});
		expect(renderer.lastDiff?.updated.map(([key]) => key)).toEqual(['a']);
		expect(renderer.lastDiff?.removed.map(([key]) => key)).toEqual(['b']);
	});
});

describe('createImmediateRenderer', () => {
	function setup() {
		const {store, viewState} = makeViewState();
		const drawn: ViewStateValue<View>[] = [];
		const surface = {name: 'context'};
		const renderer = createImmediateRenderer<typeof surface, View>({
			viewState,
			draw: ({view, surface: given}) => {
				expect(given).toBe(surface);
				drawn.push(view);
			},
		});
		return {store, drawn, surface, renderer};
	}

	it('draws the current view state on every tick', () => {
		const {store, drawn, surface, renderer} = setup();
		renderer.onAppStarted(surface);
		store.set({
			step: 'Loaded',
			cycleNumber: 1,
			cells: new Map([['a', {stake: 1}]]),
		});

		renderer.tick(frame);
		renderer.tick(frame);
		expect(drawn).toHaveLength(2);
		expect(drawn[0]).toBe(drawn[1]);
	});

	/**
	 * An immediate renderer generally has to clear its surface every frame
	 * whatever happens, so being called with nothing to draw is normal. Skipping
	 * the call instead would leave the last loaded frame burnt into the canvas.
	 */
	it('draws the Unloaded state rather than skipping the frame', () => {
		const {drawn, surface, renderer} = setup();
		renderer.onAppStarted(surface);
		renderer.tick(frame);
		expect(drawn).toEqual([{step: 'Unloaded'}]);
	});

	/**
	 * THE SUBSCRIPTION IS RELEASED, not merely ignored.
	 *
	 * `immediate.ts` exists so that every game does not write its own `let
	 * latest` and its own subscription, and its own words say why: "one of them
	 * would get it wrong by forgetting to unsubscribe". So the framework has to
	 * be held to the thing it took over.
	 *
	 * Nothing else in this file can see it. Removing the `unsubscribe()` from
	 * `onAppStopped` leaves every other test here passing, including the one
	 * below, because after stopping there is no surface and `tick` returns early
	 * anyway - so the renderer draws nothing either way and the only difference
	 * is a listener that never goes away. The game canvas mounts and unmounts on
	 * every navigation to and from `/play`, so that is one leaked subscription
	 * per visit, each one holding a closure over a dead surface.
	 *
	 * Checked through the store's own subscriber count rather than a spy,
	 * because that is the thing that actually leaks.
	 */
	it('releases its subscription when it stops', () => {
		let subscribers = 0;
		const store = writable<ViewStateValue<View>>({step: 'Unloaded'}, () => {
			subscribers++;
			return () => subscribers--;
		});
		const renderer = createImmediateRenderer<{name: string}, View>({
			viewState: {
				subscribe: store.subscribe,
				status: writable({loading: false}),
			},
			draw: () => {},
		});

		expect(subscribers).toBe(0);
		renderer.onAppStarted({name: 'surface'});
		expect(subscribers).toBe(1);
		renderer.onAppStopped();
		expect(subscribers).toBe(0);

		// And it can be started again afterwards, rather than being one-shot: the
		// canvas really does remount.
		renderer.onAppStarted({name: 'surface'});
		expect(subscribers).toBe(1);
		renderer.onAppStopped();
		expect(subscribers).toBe(0);
	});

	it('does not draw before it starts or after it stops', () => {
		const {store, drawn, surface, renderer} = setup();
		renderer.tick(frame);
		expect(drawn).toEqual([]);

		renderer.onAppStarted(surface);
		renderer.onAppStopped();
		store.set({step: 'Loaded', cycleNumber: 1, cells: new Map()});
		renderer.tick(frame);
		expect(drawn).toEqual([]);
	});
});
