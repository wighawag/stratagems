/**
 * THE STOPGAP RENDERER (P3 of step 6 in work/plans/join-template-commit-reveal.md):
 * each cell's colour and stake, drawn immediately on the template's canvas2d host
 * through the skeleton's camera, in the shape of the reference game's
 * `placement/render/board-immediate.ts`. stratagems' own twgl renderer comes back
 * behind the render seam at step 9, and this file goes then.
 *
 * Coordinates are cells: the cell at x,y spans x-0.5..x+0.5.
 */
import type {GameRenderer} from '$lib/game/core/seams';
import {createImmediateRenderer} from '$lib/game/render/immediate';
import {visibleCells} from '$lib/game/render/view-transform';
import type {ViewStateStore} from '$lib/view';
import type {BoardView} from '../view';
import {COLOURS as FACTION_COLOURS} from '../faction';

/** The factions' colours, as the legacy renderer drew them (`Color` order). */
export const COLOURS: readonly string[] = FACTION_COLOURS.map(({hex}) => hex);

export type GameSurface = CanvasRenderingContext2D;

/** The canvas host this game draws on, loaded in the browser only. */
export const loadCanvasComponent = () =>
	import('$lib/game/render/canvas2d/Canvas2DCanvas.svelte');

export function createBoardRenderer(params: {
	viewState: ViewStateStore<BoardView>;
	maxLife: number;
}): GameRenderer<GameSurface> {
	const {maxLife} = params;
	return createImmediateRenderer<GameSurface, BoardView>({
		viewState: params.viewState,

		draw({surface: context, view, frame}) {
			if (view.step === 'Unloaded') return;
			const bounds = visibleCells(frame.transform, frame.screen);
			const pixel = 1 / frame.transform.scale;

			for (const cell of view.cells.values()) {
				const {x, y} = cell;
				if (x < bounds.minX || x > bounds.maxX) continue;
				if (y < bounds.minY || y > bounds.maxY) continue;

				if (cell.life > 0 && cell.color > 0) {
					// the fuller the life, the more opaque
					context.globalAlpha = 0.35 + 0.6 * Math.min(1, cell.life / maxLife);
					context.fillStyle = COLOURS[cell.color] ?? '#ffffff';
					context.fillRect(x - 0.4, y - 0.4, 0.8, 0.8);
					context.globalAlpha = 1;
					if (cell.stake > 1) {
						context.fillStyle = '#000000';
						context.font = `${0.45}px sans-serif`;
						context.textAlign = 'center';
						context.textBaseline = 'middle';
						context.fillText(String(cell.stake), x, y);
					}
					if (cell.mine) {
						context.strokeStyle = '#ffffff';
						context.lineWidth = 2 * pixel;
						context.strokeRect(x - 0.4, y - 0.4, 0.8, 0.8);
					}
				}

				if (cell.planned !== undefined) {
					context.strokeStyle = '#ffd166';
					context.lineWidth = 2 * pixel;
					context.strokeRect(x - 0.5, y - 0.5, 1, 1);
				}
			}
		},
	});
}
