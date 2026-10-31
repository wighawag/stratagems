/**
 * WHICH RENDERER THIS GAME USES. The one file to edit to change it.
 *
 * THIS IS `with/pixi-js`, so it is the STATEFUL renderer on a pixi surface: a
 * scene graph diffed against the view state, one display object per cell.
 * `board-renderer.ts`, on `$lib/game/render/stateful`.
 *
 * **This file is the branch's whole renderer difference from `main`.** `main`
 * selects the immediate canvas-2d host instead and carries no rendering library
 * at all; everything else about the two boards - the camera, the gestures, the
 * click handling, and `routes/play/+page.svelte` - is byte-identical, because
 * the two canvas hosts take the same props. That property is what makes the
 * branch affordable, and `web/test/render-host-boundary.test.ts` (inherited
 * from `main`) fails if it stops being true. See D11 in
 * `work:work/specs/proposed/games-on-this-foundation.md`, and this branch's
 * `README.pixi-js.md` for the full shared-file edit list.
 *
 * The diffing machinery is NOT on this branch. `$lib/game/render/stateful` and
 * `reconcile.ts` import no rendering library and live on `main`, where a
 * three.js or twgl host would find them without adopting pixi. Only the pixi
 * HOST, this game's pixi board, and the art pipeline are here.
 *
 * The THIRD style, REACTIVE (Svelte), is NOT swapped here, and saying it is
 * would be misleading. It is not a `GameRenderer` at all: there is no surface,
 * no frame loop and nothing to hand to `onAppStarted`, so a reactive game
 * deletes this file and drops `gameRenderer` from the context rather than
 * pointing it somewhere else. What it keeps is the view state, which is already
 * a store and needs no adapter.
 *
 * What it does NOT get for free is the camera, and this is the part that bites.
 * The poller is camera-scoped: `createPollingOnchainState` refuses to fetch
 * while the camera reports no size (`onchain/state.ts`, "the camera has no size
 * until the canvas has laid itself out"). A component that only subscribes to
 * `viewState` never calls `cameraControl.resize`, so the board stays EMPTY
 * FOREVER with no error anywhere: no failed request, no console warning, just
 * an empty board that looks like a game with nothing in it yet.
 *
 * So a reactive game does one of two things, and should decide which on
 * purpose:
 *
 * - keep the camera, and have its component report its own size and drive
 *   pan/zoom into `cameraControl`. `connectSurfaceInput` works on any element,
 *   not just a canvas, so this is a few lines rather than a rewrite.
 * - drop camera scoping, and give `createPollingOnchainState` a fixed scope
 *   instead. Right for a game whose world fits on one screen (a card game, a
 *   small fixed board), which is most games that want to render in Svelte.
 */
import type {Container} from 'pixi.js';
import type {GameRenderer} from '$lib/game/core/seams';
import type {ViewStateStore} from '$lib/view';
import type {BoardView} from '../view';
import {createBoardRenderer} from './board-renderer';

/**
 * What the mounted surface hands the renderer.
 *
 * Named once, here, so that no other module has to mention a rendering library
 * by name. On `main` this is `CanvasRenderingContext2D`; a three.js game makes
 * it a `Scene`.
 */
export type GameSurface = Container;

/** Loaded dynamically, and only in the browser: see `routes/play/+page.svelte`. */
export const loadCanvasComponent = () =>
	import('$lib/game/render/pixi/PixiCanvas.svelte');

export function createGameRenderer(params: {
	viewState: ViewStateStore<BoardView>;
	cellSize: number;
}): GameRenderer<GameSurface> {
	return createBoardRenderer(params);
}
