/**
 * Stateful rendering: a scene graph kept in step with the view state.
 *
 * The pixi and three.js shape. The renderer owns one object per entity and the
 * framework works out which ones to create, update and destroy, so the game
 * writes only the three handlers that are actually about ITS entities.
 *
 * The subscription is push, not per-frame: a scene graph only needs touching
 * when the state changes, and diffing on every frame instead would burn a diff
 * per frame to discover nothing happened. `tick` stays available for animation
 * that does not come from state at all.
 */
import type {
	Frame,
	GameRenderer,
	ViewStateStore,
	ViewStateValue,
} from '$lib/game/core/seams';
import {
	createReconciler,
	type Changed,
	type Keyed,
	type Diff,
} from './reconcile';

export type StatefulRendererParams<TSurface, TView, TKey, TEntity, TObject> = {
	viewState: ViewStateStore<TView>;
	/**
	 * The keyed entities to draw, pulled out of the view state.
	 *
	 * A view state usually holds more than one drawable collection, and a game
	 * with several composes several renderers rather than growing one that
	 * branches.
	 *
	 * Typed against the LOADED branch rather than `TView`, so the loaded value
	 * reaches it without a cast and `cycleNumber` is visible on the value itself.
	 */
	entities(
		view: Extract<ViewStateValue<TView>, {step: 'Loaded'}>,
		cycleNumber: number,
	): Keyed<TKey, TEntity>;
	/** Defaults to reference inequality. See `reconcile.ts`. */
	changed?: Changed<TEntity>;

	add(params: {key: TKey; entity: TEntity; surface: TSurface}): TObject;
	update(params: {
		key: TKey;
		entity: TEntity;
		object: TObject;
		surface: TSurface;
	}): void;
	remove(params: {key: TKey; object: TObject; surface: TSurface}): void;

	/**
	 * Called when the view state moves to a new cycle, BEFORE that cycle's
	 * entities are applied.
	 *
	 * A commit-reveal game needs this and an ordinary one does not: everything
	 * drawn from local intent (a planned move, a preview, a phase overlay) is
	 * scoped to one cycle and is meaningless in the next. Without a signal, a
	 * renderer can only infer the boundary from entities changing, which is
	 * exactly the inference that fails when nothing changed.
	 */
	onCycleChanged?(params: {
		cycleNumber: number;
		previousCycleNumber: number | undefined;
		surface: TSurface;
	}): void;

	onStarted?(surface: TSurface): void;
	/**
	 * Called on teardown, AFTER the scene objects have been let go.
	 *
	 * For resources the surface does not own and will not free by being
	 * destroyed. Anything the surface holds needs no cleanup here; see
	 * `Reconciler.forget`. Takes the surface, like the immediate renderer's, so
	 * the two lifecycles read the same way.
	 */
	onStopped?(surface: TSurface): void;

	/**
	 * Animation that does not come from state changes.
	 *
	 * `objects` is every scene object currently live, which is what makes
	 * per-object animation possible here at all: without it a renderer that
	 * wants to advance one animation per entity has to keep its own parallel
	 * collection, filled in `add` and emptied in `remove`. That is a second
	 * source of truth, it is wrong exactly when a handler throws or a key is
	 * re-added, and it is silent when it is wrong.
	 */
	tick?(params: {
		frame: Frame;
		surface: TSurface;
		objects: IterableIterator<TObject>;
		entries: IterableIterator<[TKey, TObject]>;
	}): void;
};

export function createStatefulRenderer<TSurface, TView, TKey, TEntity, TObject>(
	params: StatefulRendererParams<TSurface, TView, TKey, TEntity, TObject>,
): GameRenderer<TSurface> & {
	/** The last diff applied. For tests, and for a HUD that reports activity. */
	readonly lastDiff: Diff<TKey, TEntity> | undefined;
} {
	let surface: TSurface | undefined;
	let unsubscribe: (() => void) | undefined;
	let cycleNumber: number | undefined;
	let lastDiff: Diff<TKey, TEntity> | undefined;

	const reconciler = createReconciler<TKey, TEntity, TObject>(
		{
			add: (key, entity) =>
				params.add({key, entity, surface: surface as TSurface}),
			update: (object, entity, key) =>
				params.update({key, entity, object, surface: surface as TSurface}),
			remove: (object, key) =>
				params.remove({key, object, surface: surface as TSurface}),
		},
		params.changed,
	);

	return {
		onAppStarted(next: TSurface) {
			surface = next;
			params.onStarted?.(next);

			unsubscribe = params.viewState.subscribe(($view) => {
				if ($view.step === 'Unloaded') {
					// Not a no-op. State going back to Unloaded means what is on screen
					// is no longer known to be true (an account switch, a chain reset),
					// and leaving it there shows a board that belongs to nobody.
					reconciler.clear();
					cycleNumber = undefined;
					return;
				}

				if ($view.cycleNumber !== cycleNumber) {
					params.onCycleChanged?.({
						cycleNumber: $view.cycleNumber,
						previousCycleNumber: cycleNumber,
						surface: next,
					});
					cycleNumber = $view.cycleNumber;
				}

				lastDiff = reconciler.apply(params.entities($view, $view.cycleNumber));
			});
		},

		onAppStopped() {
			unsubscribe?.();
			unsubscribe = undefined;
			reconciler.forget();
			cycleNumber = undefined;
			lastDiff = undefined;
			if (surface !== undefined) params.onStopped?.(surface);
			surface = undefined;
		},

		tick(frame: Frame) {
			if (surface === undefined) return;
			params.tick?.({
				frame,
				surface,
				objects: reconciler.values(),
				entries: reconciler.entries(),
			});
		},

		get lastDiff() {
			return lastDiff;
		},
	};
}
