/**
 * The sprite bundle: loading it, and reporting how far it has got.
 *
 * PIXI'S, which is why it is here and not on `main`. It reads a pixi manifest
 * through pixi's own `Assets`, so it means nothing to a twgl or three.js host;
 * `main` therefore carries neither this nor the pipeline that writes the
 * manifest. See D11.
 *
 * MOVED from reveal-or-die (`web/src/lib/world/render/assets.ts`), where it was
 * written as "this game's problem, not the framework's". That was right while
 * the framework had no art pipeline at all. Now that the pipeline is a node in
 * the tree, the loader belongs beside it: every pixi game on this branch loads
 * one bundle, publishes one progress value and has to survive the bundle
 * failing, and that is not something each of them should discover separately.
 * What stays the GAME's is which sprites exist and what they mean.
 *
 * Loading starts at module scope rather than in `onAppStarted`, so it overlaps
 * with everything else the app is doing instead of waiting for a canvas to
 * mount.
 */
import {Assets, TextureStyle, type Spritesheet} from 'pixi.js';
import {writable, type Readable} from 'svelte/store';
import manifest from '$lib/manifest.json';

// Pixel art: never smooth it. Set before anything is loaded, since it is the
// default applied at texture construction.
TextureStyle.defaultOptions.scaleMode = 'nearest';

const BUNDLE = 'default';
const SPRITES = 'sprites';

let ready = false;

/**
 * 0 to 1. Reaches 1 whether the bundle loaded or FAILED; see below.
 *
 * A `writable` rather than a `readable` with a start function, because loading
 * begins at module scope and the loading gate subscribes later. A `readable`
 * only runs its producer while something is subscribed, so every update
 * published before the first subscriber would be dropped and a late subscriber
 * would read 0 forever - which is precisely the loading screen that never goes
 * away.
 */
const progress = writable(0);
export const assetProgress: Readable<number> = {subscribe: progress.subscribe};
const setProgress = (value: number) => progress.set(value);

/** Whether the sprite sheet can be read right now. */
export function spritesReady(): boolean {
	return ready;
}

/** The loaded sheet, or undefined while it is still in flight. */
export function sprites(): Spritesheet | undefined {
	return ready ? Assets.get(SPRITES) : undefined;
}

let loading: Promise<void> | undefined;

/**
 * Begin loading, once per page.
 *
 * Idempotent because `Assets.init` may only be called once and throws on the
 * second attempt, while this is reachable from both the loading gate and the
 * renderer.
 */
export function loadWorldAssets(): Promise<void> {
	if (loading) return loading;

	loading = (async () => {
		await Assets.init({manifest});
		await Assets.loadBundle(BUNDLE, (value) => setProgress(value));
		ready = true;
		setProgress(1);
	})().catch((err) => {
		// Progress is driven to 1 on failure ON PURPOSE. It is what the gate
		// waits on, and a bundle that 404s would otherwise leave the player
		// staring at a loading screen forever with no way past it.
		//
		// This is load-bearing for the TEMPLATE in a way it was not for the game
		// it came from: an empty manifest is a supported state here (a clone with
		// no `../assets` builds and runs), and the board is drawn with vector
		// graphics whenever the sheet is missing. Missing art is a plainer
		// picture, never a broken game.
		console.error('could not load the sprite bundle', err);
		setProgress(1);
	});

	return loading;
}

// `typeof window` rather than `$lib/kit`'s `browser`, because this repo's kit
// re-exports only `version`. Every other module under `$lib/game/**` that needs
// this asks the same way (`cycle.ts`, `chain-time.ts`, `gamepad.ts`), so this
// is the house style here rather than a shortcut. reveal-or-die's kit DOES
// export `browser`, and adding it upstream is worth doing - but on `main`,
// where every node gets it, not on this branch, where it would be a shared-file
// edit bought for one import. See
// `work:work/notes/observations/the-kit-does-not-re-export-browser.md`.
if (typeof window !== 'undefined') {
	void loadWorldAssets();
}
