/**
 * The board, drawn from scratch every frame.
 *
 * IMMEDIATE rendering, the twgl / stratagems shape. There is no scene graph and
 * nothing is remembered between frames: the renderer is handed the current view
 * state and draws it. Compare `board-renderer.ts`, which draws the same board
 * with the same rules as a pixi scene graph; between them they are what keeps
 * the render seam honest.
 *
 * The canvas-2d context is a stand-in for a real GPU renderer, chosen so the
 * template can ship a second renderer without a second dependency. Everything
 * structural here (the per-frame draw, the culling, drawing in game units under
 * the camera transform) is what a twgl renderer does; only the four drawing
 * calls would change.
 */
import type {GameRenderer} from '$lib/game/core/seams';
import {createImmediateRenderer} from '$lib/game/render/immediate';
import {visibleCells} from '$lib/game/render/view-transform';
import type {ViewStateStore} from '$lib/view';
import type {BoardView} from '../view';

const CONFIRMED_COLOUR = '#4f8cff';
const PLANNED_COLOUR = '#ffd166';

export function createImmediateBoardRenderer(params: {
	viewState: ViewStateStore<BoardView>;
}): GameRenderer<CanvasRenderingContext2D> {
	return createImmediateRenderer<CanvasRenderingContext2D, BoardView>({
		viewState: params.viewState,

		draw({surface: context, view, frame}) {
			// The host has already cleared the surface and applied the camera, so
			// an Unloaded view legitimately draws nothing. It still has to be a
			// frame rather than a skipped call: see `immediate.ts`.
			if (view.step === 'Unloaded') return;

			const bounds = visibleCells(frame.transform, frame.screen);

			for (const cell of view.cells.values()) {
				// Culling is the renderer's job in immediate mode, because it is the
				// only thing that knows what it is about to draw. The view state is
				// scoped to the camera's zones already, but a zone is 16 cells and
				// the camera can be showing a fraction of one.
				const {x, y} = cell.position;
				if (x < bounds.minX || x > bounds.maxX) continue;
				if (y < bounds.minY || y > bounds.maxY) continue;

				if (cell.numClaimants > 0) {
					// Contested cells are shared, not won: the fill shows there is
					// stake here, and the claimant count is what says it is not one
					// player's. Same rule, and the same numbers, as `CellObject`.
					context.globalAlpha = Math.min(0.35 + 0.2 * cell.numClaimants, 0.95);
					context.fillStyle = CONFIRMED_COLOUR;
					context.fillRect(x - 0.35, y - 0.35, 0.7, 0.7);
					context.globalAlpha = 1;
				}

				if (cell.planned && cell.next) {
					// WHAT THE PLAN LEADS TO, from the contract's own rule (see
					// `../preview.ts`): a smaller square at the fill the cell will have
					// once the turn is revealed, in the planned colour so it never
					// reads as confirmed. Absent until the sandbox answers, so the
					// outline below is drawn at once and this a moment later.
					context.globalAlpha = Math.min(
						0.35 + 0.2 * cell.next.numClaimants,
						0.95,
					);
					context.fillStyle = PLANNED_COLOUR;
					context.fillRect(x - 0.2, y - 0.2, 0.4, 0.4);
					context.globalAlpha = 1;
				}

				if (cell.planned) {
					// Planned placements are outlined rather than filled so they never
					// read as confirmed. Line width is in game units after the camera
					// transform, so a 2px stroke is 2 / scale.
					context.strokeStyle = PLANNED_COLOUR;
					context.lineWidth = 2 / frame.transform.scale;
					context.strokeRect(x - 0.5, y - 0.5, 1, 1);
				}
			}
		},
	});
}
