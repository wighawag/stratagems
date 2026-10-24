import {describe, expect, it} from 'vitest';
import {createReconciler, diffKeyed} from '$lib/game/render/reconcile';

type Cell = {stake: number};

describe('diffKeyed', () => {
	it('splits a change into added, updated and removed', () => {
		const previous = new Map<string, Cell>([
			['a', {stake: 1}],
			['b', {stake: 2}],
		]);
		const next = new Map<string, Cell>([
			['b', {stake: 3}],
			['c', {stake: 4}],
		]);
		const diff = diffKeyed(previous, next);
		expect(diff.added.map(([key]) => key)).toEqual(['c']);
		expect(diff.updated.map(([key]) => key)).toEqual(['b']);
		expect(diff.removed.map(([key]) => key)).toEqual(['a']);
	});

	it('reports nothing when the entities are identical by reference', () => {
		const cell = {stake: 1};
		const diff = diffKeyed(new Map([['a', cell]]), new Map([['a', cell]]));
		expect(diff).toEqual({added: [], updated: [], removed: []});
	});

	/**
	 * The default comparison is by reference, and a merge that rebuilds its
	 * entities on every derive (which `mergeBoardView` does) therefore reports
	 * everything as updated. That is the reason `changed` exists, and the reason
	 * the board renderer supplies one.
	 */
	it('reports every entity as updated when a merge rebuilds them', () => {
		const previous = new Map([['a', {stake: 1}]]);
		const next = new Map([['a', {stake: 1}]]);
		expect(diffKeyed(previous, next).updated).toHaveLength(1);
		expect(
			diffKeyed(previous, next, (a, b) => a.stake !== b.stake).updated,
		).toHaveLength(0);
	});

	/**
	 * A key whose value is legitimately `undefined` is present, not absent.
	 * Reaching for `previous.get(key)` alone conflates the two and reports an
	 * update as an add, which in a renderer means a second object on top of the
	 * first and a leak that grows with every state change.
	 */
	it('distinguishes an absent key from one holding undefined', () => {
		const previous = new Map<string, undefined>([['a', undefined]]);
		const next = new Map<string, undefined>([['a', undefined]]);
		const diff = diffKeyed(previous, next);
		expect(diff.added).toHaveLength(0);
		expect(diff.updated).toHaveLength(0);
	});
});

type Log = string[];

function makeReconciler(log: Log, changed?: (a: Cell, b: Cell) => boolean) {
	return createReconciler<string, Cell, {id: string; stake: number}>(
		{
			add: (key, entity) => {
				log.push(`add ${key}`);
				return {id: key, stake: entity.stake};
			},
			update: (object, entity, key) => {
				log.push(`update ${key}`);
				object.stake = entity.stake;
			},
			remove: (object, key) => {
				log.push(`remove ${key}`);
			},
		},
		changed,
	);
}

describe('createReconciler', () => {
	it('creates, updates and destroys objects to match the snapshots', () => {
		const log: Log = [];
		const reconciler = makeReconciler(log, (a, b) => a.stake !== b.stake);

		reconciler.apply(new Map([['a', {stake: 1}]]));
		expect(log).toEqual(['add a']);
		expect(reconciler.get('a')).toEqual({id: 'a', stake: 1});

		log.length = 0;
		reconciler.apply(new Map([['a', {stake: 2}]]));
		expect(log).toEqual(['update a']);
		expect(reconciler.get('a')?.stake).toBe(2);

		log.length = 0;
		reconciler.apply(new Map());
		expect(log).toEqual(['remove a']);
		expect(reconciler.get('a')).toBeUndefined();
		expect(reconciler.size).toBe(0);
	});

	it('does nothing at all when nothing changed', () => {
		const log: Log = [];
		const reconciler = makeReconciler(log, (a, b) => a.stake !== b.stake);
		reconciler.apply(new Map([['a', {stake: 1}]]));
		log.length = 0;
		reconciler.apply(new Map([['a', {stake: 1}]]));
		expect(log).toEqual([]);
	});

	/**
	 * The case a hand-written render loop always forgets: state going back to
	 * Unloaded (an account switch, a chain reset) must take the scene with it, or
	 * the player is left looking at a board that belongs to nobody. It looks like
	 * a rendering hiccup rather than a bug, so it survives a long time.
	 */
	it('clear() removes everything through the handlers', () => {
		const log: Log = [];
		const reconciler = makeReconciler(log);
		reconciler.apply(
			new Map([
				['a', {stake: 1}],
				['b', {stake: 2}],
			]),
		);
		log.length = 0;
		reconciler.clear();
		expect(log.sort()).toEqual(['remove a', 'remove b']);
		expect(reconciler.size).toBe(0);
	});

	/**
	 * Teardown is the opposite case: the surface is being destroyed and has
	 * already taken the objects with it, so running remove handlers is at best
	 * wasted work and at worst an exception thrown during unmount.
	 */
	it('forget() drops everything without running the handlers', () => {
		const log: Log = [];
		const reconciler = makeReconciler(log);
		reconciler.apply(new Map([['a', {stake: 1}]]));
		log.length = 0;
		reconciler.forget();
		expect(log).toEqual([]);
		expect(reconciler.size).toBe(0);

		// And the next snapshot starts clean rather than diffing against a scene
		// that no longer exists.
		reconciler.apply(new Map([['a', {stake: 1}]]));
		expect(log).toEqual(['add a']);
	});

	it('re-adds an object that went missing behind its back', () => {
		const log: Log = [];
		const reconciler = createReconciler<string, Cell, {id: string}>(
			{
				add: (key) => {
					log.push(`add ${key}`);
					return {id: key};
				},
				update: (_object, _entity, key) => log.push(`update ${key}`),
				remove: (_object, key) => log.push(`remove ${key}`),
			},
			() => true,
		);
		reconciler.apply(new Map([['a', {stake: 1}]]));
		// Simulate a handler having removed it: the reconciler must heal rather
		// than leave a permanent hole in the scene.
		reconciler.forget();
		log.length = 0;
		reconciler.apply(new Map([['a', {stake: 2}]]));
		expect(log).toEqual(['add a']);
	});

	it('enumerates the live objects, for a renderer that animates them', () => {
		// The case the stateful renderer is RECOMMENDED for: `tick` is handed a
		// frame and nothing else, so without this a renderer advancing one
		// animation per object has to keep a parallel collection filled in `add`
		// and emptied in `remove` - a second source of truth that is silent when
		// it is wrong. A game on this template had already written one.
		const log: Log = [];
		const reconciler = makeReconciler(log);
		reconciler.apply(
			new Map([
				['a', {stake: 1}],
				['b', {stake: 2}],
			]),
		);

		expect([...reconciler.values()].map((o) => o.id)).toEqual(['a', 'b']);
		expect([...reconciler.entries()].map(([key, o]) => [key, o.id])).toEqual([
			['a', 'a'],
			['b', 'b'],
		]);
	});

	it('stops enumerating an object the snapshot dropped', () => {
		// The half a hand-kept parallel collection gets wrong: `remove` ran, so
		// the object is off the surface, and anything still iterating it is
		// animating something nobody can see.
		const log: Log = [];
		const reconciler = makeReconciler(log);
		reconciler.apply(
			new Map([
				['a', {stake: 1}],
				['b', {stake: 2}],
			]),
		);
		reconciler.apply(new Map([['b', {stake: 2}]]));

		expect([...reconciler.values()].map((o) => o.id)).toEqual(['b']);

		// And `clear`/`forget` leave nothing to iterate at all.
		reconciler.clear();
		expect([...reconciler.values()]).toEqual([]);
	});

	it('accepts any iterable of entries, not only a Map', () => {
		const log: Log = [];
		const reconciler = makeReconciler(log);
		reconciler.apply([
			['a', {stake: 1}],
			['b', {stake: 2}],
		]);
		expect(reconciler.size).toBe(2);
	});
});
