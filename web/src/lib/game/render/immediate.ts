/**
 * Immediate rendering: the whole picture, redrawn every frame.
 *
 * The twgl and canvas-2d shape, and the one stratagems uses. There is no scene
 * graph and nothing to diff, so all the framework owes the renderer is the
 * current view state at the moment it draws.
 *
 * That is genuinely all that was missing. A store is a PUSH interface and a
 * frame loop is a PULL one, so an immediate renderer that only had the store
 * would keep its own `let latest` and its own subscription, which is five lines
 * that every game would write identically and one of them would get wrong by
 * forgetting to unsubscribe. Here the snapshot is held for it and handed to
 * `draw` with the frame.
 *
 * Note what is NOT here: any notion of what changed. That is the whole appeal
 * of immediate mode, and a game that finds itself wanting it wants
 * `createStatefulRenderer` instead.
 */
import type {
	Frame,
	GameRenderer,
	ViewStateStore,
	ViewStateValue,
} from '$lib/game/core/seams';

export type ImmediateRendererParams<TSurface, TView> = {
	viewState: ViewStateStore<TView>;
	/**
	 * Draw one frame.
	 *
	 * Receives the view state as-is, INCLUDING the Unloaded case, rather than
	 * being skipped until it loads. An immediate renderer generally has to clear
	 * its surface every frame whatever happens, so being called with nothing to
	 * draw is normal and skipping the call would leave the last loaded frame
	 * burnt into the canvas.
	 */
	draw(params: {
		surface: TSurface;
		view: ViewStateValue<TView>;
		frame: Frame;
	}): void;

	onStarted?(surface: TSurface): void;
	onStopped?(surface: TSurface): void;
};

export function createImmediateRenderer<TSurface, TView>(
	params: ImmediateRendererParams<TSurface, TView>,
): GameRenderer<TSurface> {
	let surface: TSurface | undefined;
	let unsubscribe: (() => void) | undefined;
	let view: ViewStateValue<TView> = {step: 'Unloaded'};

	return {
		onAppStarted(next: TSurface) {
			surface = next;
			// Subscribed rather than read per frame because a Svelte store has no
			// synchronous read that does not allocate a subscription, and doing that
			// at 60Hz is the kind of cost that never shows up in a profile as one
			// line.
			unsubscribe = params.viewState.subscribe(($view) => {
				view = $view;
			});
			params.onStarted?.(next);
		},

		onAppStopped() {
			unsubscribe?.();
			unsubscribe = undefined;
			if (surface !== undefined) params.onStopped?.(surface);
			surface = undefined;
			view = {step: 'Unloaded'};
		},

		tick(frame: Frame) {
			if (surface === undefined) return;
			params.draw({surface, view, frame});
		},
	};
}
