/**
 * What changed between two snapshots of a keyed collection.
 *
 * A stateful renderer (pixi, three.js) does not draw a picture, it maintains a
 * scene graph, so what it needs from a new view state is not the state but the
 * DIFFERENCE: which objects to create, which to update, which to destroy. Every
 * such renderer writes that loop, and writing it by hand goes wrong in the same
 * four ways every time, so it is written once here.
 *
 * Pure and synchronous: no scene graph, no framework, no side effects. That is
 * what lets the awkward cases (an entity that vanishes, a reload back to
 * Unloaded, a cycle boundary) be tested without a GPU, which is the only way
 * they ever get tested at all.
 */

export type Keyed<TKey, TEntity> =
	ReadonlyMap<TKey, TEntity> | Iterable<readonly [TKey, TEntity]>;

export type Diff<TKey, TEntity> = {
	added: [TKey, TEntity][];
	/** Present in both, and `changed` said they differ. */
	updated: [TKey, TEntity][];
	/** Gone from the new snapshot; the value is the one last seen. */
	removed: [TKey, TEntity][];
};

/**
 * Whether an entity needs redrawing.
 *
 * Defaults to reference inequality, which is right for a view state derived by
 * a merge that copies entities (as `mergeBoardView` does), and wrong for one
 * that mutates them in place. A game that mutates supplies its own comparison,
 * or fixes the merge, and the second is usually the better idea.
 *
 * This is what replaces the hand-written "dirty key" strings that stateful
 * renderers grow (`${stake}:${claimants}:${planned}`). Those are silent when
 * they are wrong: a field left out of the key simply never updates on screen,
 * and nothing fails.
 */
export type Changed<TEntity> = (previous: TEntity, next: TEntity) => boolean;

const defaultChanged: Changed<unknown> = (previous, next) => previous !== next;

/**
 * Diff two snapshots.
 *
 * Allocation is proportional to what CHANGED, not to the size of the
 * collection: an unchanged board of ten thousand cells produces three empty
 * arrays and iterates once. The obvious implementation (copy the keys, subtract
 * the sets) allocates the whole board every frame instead, which is the
 * difference between a diff you can run per frame and one you cannot.
 */
export function diffKeyed<TKey, TEntity>(
	previous: ReadonlyMap<TKey, TEntity>,
	next: ReadonlyMap<TKey, TEntity>,
	changed: Changed<TEntity> = defaultChanged,
): Diff<TKey, TEntity> {
	const diff: Diff<TKey, TEntity> = {added: [], updated: [], removed: []};

	for (const [key, entity] of next) {
		const before = previous.get(key);
		if (before === undefined && !previous.has(key)) {
			diff.added.push([key, entity]);
		} else if (changed(before as TEntity, entity)) {
			diff.updated.push([key, entity]);
		}
	}

	for (const [key, entity] of previous) {
		if (!next.has(key)) diff.removed.push([key, entity]);
	}

	return diff;
}

export type ReconcilerHandlers<TKey, TEntity, TObject> = {
	/** Build the scene object for a newly seen entity. */
	add(key: TKey, entity: TEntity): TObject;
	/** Bring an existing object in line with a changed entity. */
	update(object: TObject, entity: TEntity, key: TKey): void;
	/** Tear the object down. Always called before the object is forgotten. */
	remove(object: TObject, key: TKey): void;
};

export type Reconciler<TKey, TEntity, TObject> = {
	/** Apply a new snapshot. */
	apply(next: Keyed<TKey, TEntity>): Diff<TKey, TEntity>;
	/**
	 * Remove everything, as if an empty snapshot had arrived.
	 *
	 * This is the case a hand-written loop always forgets. A view state that
	 * returns to Unloaded (an account switch, a chain reset, a reconnect) leaves
	 * every object on screen forever, showing a board that belongs to nobody, and
	 * because it looks like a rendering hiccup rather than a bug it survives for
	 * a long time.
	 */
	clear(): void;
	/**
	 * Drop everything WITHOUT running the remove handlers.
	 *
	 * For teardown, where the surface itself is going away and has already taken
	 * the objects with it. Removing a child from a destroyed pixi Application is
	 * at best wasted work and at worst an exception thrown during unmount, which
	 * is a place errors are easy to miss. A renderer holding resources the
	 * surface does NOT own (WebGL textures, workers) frees them in `onStopped`
	 * instead.
	 */
	forget(): void;
	/** The object for a key, for a renderer that needs to reach one directly. */
	get(key: TKey): TObject | undefined;
	/**
	 * Every live object, for a renderer that has to touch all of them.
	 *
	 * The reason this exists is per-frame animation, which is the case the
	 * stateful renderer is RECOMMENDED for: `tick` is handed a frame and
	 * nothing else, so without a way to enumerate what is on screen a renderer
	 * that wants to advance one animation per object has to keep its own
	 * parallel `Set` and remember to add to it in `add` and delete from it in
	 * `remove`. That duplicate is a second source of truth which is wrong
	 * exactly when a handler throws or a key is re-added, and it is silent when
	 * it is wrong. A game on this template had already written one.
	 *
	 * Live views over the reconciler's own map, so iterating during `tick`
	 * costs no allocation. Do not add or remove objects behind the
	 * reconciler's back while iterating; change the SNAPSHOT and let `apply`
	 * do it.
	 */
	values(): IterableIterator<TObject>;
	/** The same, with keys, for a renderer whose animation is keyed. */
	entries(): IterableIterator<[TKey, TObject]>;
	readonly size: number;
};

/**
 * A reconciler that owns the objects it creates.
 *
 * Keeps its own copy of the last snapshot rather than reading it back off the
 * objects, so an object the renderer mutates for its own reasons (an animation,
 * a hover state) cannot make the diff lie.
 */
export function createReconciler<TKey, TEntity, TObject>(
	handlers: ReconcilerHandlers<TKey, TEntity, TObject>,
	changed: Changed<TEntity> = defaultChanged,
): Reconciler<TKey, TEntity, TObject> {
	const objects = new Map<TKey, TObject>();
	let snapshot: ReadonlyMap<TKey, TEntity> = new Map();

	function applyMap(next: ReadonlyMap<TKey, TEntity>): Diff<TKey, TEntity> {
		const diff = diffKeyed(snapshot, next, changed);

		for (const [key, entity] of diff.added) {
			objects.set(key, handlers.add(key, entity));
		}
		for (const [key, entity] of diff.updated) {
			const object = objects.get(key);
			// Absent only if `add` threw last time round, or if a handler removed
			// the object behind the reconciler's back. Treated as an add rather
			// than skipped, so one failure does not leave a permanent hole.
			if (object === undefined) objects.set(key, handlers.add(key, entity));
			else handlers.update(object, entity, key);
		}
		for (const [key] of diff.removed) {
			const object = objects.get(key);
			if (object !== undefined) handlers.remove(object, key);
			objects.delete(key);
		}

		snapshot = next;
		return diff;
	}

	return {
		apply(next: Keyed<TKey, TEntity>) {
			return applyMap(next instanceof Map ? next : new Map(next));
		},
		clear() {
			applyMap(new Map());
		},
		forget() {
			objects.clear();
			snapshot = new Map();
		},
		get(key: TKey) {
			return objects.get(key);
		},
		values() {
			return objects.values();
		},
		entries() {
			return objects.entries();
		},
		get size() {
			return objects.size;
		},
	};
}
