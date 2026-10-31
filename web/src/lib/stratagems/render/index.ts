/**
 * WHICH CANVAS AND RENDERER STRATAGEMS USES (step 9): the template's pixi host
 * (`$lib/game/render/pixi`, from `with/pixi-js` through `with/fuzd-pixi-indexer`) with
 * smooth art, and this game's board on it. The play page loads the host from
 * here, which is how `test/render-host-boundary.test.ts` finds it.
 *
 * NO SECOND HOST (P9-7, changed after step 9's measurements): when WebGL
 * cannot start, pixi falls back to its own Canvas renderer by itself, and the
 * board uses no filter, so it looks the same there.
 */
import type {Container} from 'pixi.js';

/** What the mounted surface hands the renderer. */
export type GameSurface = Container;

/** Loaded dynamically, and only in the browser: see `routes/play/+page.svelte`. */
export const loadCanvasComponent = () =>
	import('$lib/game/render/pixi/PixiCanvas.svelte');

export {createBoardRenderer} from './board-renderer';
export {createFocus, type FocusStore} from './focus';
