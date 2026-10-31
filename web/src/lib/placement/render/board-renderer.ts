/**
 * The board, drawn as a pixi scene graph.
 *
 * STATEFUL rendering: one display object per cell, created when a cell first
 * appears, updated when it changes, destroyed when it goes. The create /
 * update / destroy bookkeeping is the framework's (`$lib/game/render/stateful`)
 * and what is left here is only the part about cells.
 *
 * Nothing here reads the chain or knows the rules; it mirrors what the view
 * state says, which is what makes the renderer a seam the game fills rather
 * than a place logic accumulates.
 */
import type {Container} from 'pixi.js';
import type {GameRenderer} from '$lib/game/core/seams';
import {createStatefulRenderer} from '$lib/game/render/stateful';
import type {Changed} from '$lib/game/render/reconcile';
import type {ViewStateStore} from '$lib/view';
import type {BoardView, CellView} from '../view';
import {CellObject} from './CellObject';

/**
 * Whether a cell needs redrawing.
 *
 * Supplied rather than left at the default (reference inequality) because
 * `mergeBoardView` rebuilds every `CellView` object on every derive, so by
 * reference the whole board changes each time the poller returns, whether or
 * not anything actually moved. On a large board that is the difference between
 * redrawing nothing and redrawing everything, several times a minute.
 *
 * `position` is deliberately not compared: it is derived from the cell id,
 * which is the key, so it cannot change without the entity being a different
 * entity.
 */
const cellChanged: Changed<CellView> = (previous, next) =>
	previous.totalStake !== next.totalStake ||
	previous.numClaimants !== next.numClaimants ||
	previous.planned !== next.planned;

export function createBoardRenderer(params: {
	viewState: ViewStateStore<BoardView>;
	cellSize: number;
}): GameRenderer<Container> {
	const {viewState, cellSize} = params;

	return createStatefulRenderer<
		Container,
		BoardView,
		bigint,
		CellView,
		CellObject
	>({
		viewState,
		entities: (view) => view.cells,
		changed: cellChanged,

		add({entity, surface}) {
			const object = new CellObject(cellSize, entity);
			surface.addChild(object);
			return object;
		},

		update({object, entity}) {
			object.update(entity);
		},

		remove({object, surface}) {
			surface.removeChild(object);
			object.onRemoved();
		},
	});
}
