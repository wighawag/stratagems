import {chromeBar} from '$lib/core/ui/chrome';
import type {SurfaceChrome} from '$lib/ui/chrome';
import OfflineWorldNavbar from '$lib/ui/offline-world/OfflineWorldNavbar.svelte';
import OfflineWorldBar from '$lib/ui/offline-world/OfflineWorldBar.svelte';

/**
 * THE OFFLINE WORLD'S CHROME: what goes above a page this world OWNS.
 *
 * ## Why it has one at all
 *
 * The mechanism is jolly-roger's and the test it turns on is not "embedded versus
 * full screen", it is whether the chrome's CLAIMS REMAIN TRUE of the surface the
 * player is looking at (`$lib/ui/chrome`, and ADR-0009 there). This surface is
 * the case where they are false. The world generated its own wallet, so the
 * account the app's navbar would show is not the player's; there is nothing to
 * connect to, so "connected" reports a state with one possible value; and the
 * world invented the money, so a credits figure is a number about nothing. A
 * player who played the online version first comes back to a different address
 * with a different balance in the same position on screen, and the honest reading
 * is "my account changed".
 *
 * The apology this route used to print - "the navbar above is still describing
 * the remote chain" - was the honest interim answer and is now obsolete rather
 * than merely unfashionable: there is no remote chain being described up there
 * any more, because up there is this.
 *
 * NOTE WHICH CASE THE OTHER OFFLINE ROUTE IN THIS TREE IS IN. jolly-roger's
 * `/offline-demo` KEEPS the app's chrome and declares nothing, because there the
 * page is still that app's, showing one panel that happens to run against a chain
 * in the tab, and the account, the balance and the RPC state above it are all
 * true. Replacing the chrome there would delete three true answers. The
 * difference is ownership of the page, not the size of the thing embedded in it.
 *
 * ## Why this file exists rather than the declaration living in the route
 *
 * The same reason `offline-lobby.ts` is a module: `+page.ts` should say WHICH
 * chrome and nothing else, and the reasoning above is about this world, not about
 * a route's data-loading. It sits beside `offline.ts` and `offline-lobby.ts`
 * because it is the third thing this app composes around the same world.
 *
 * ## Why the declaration is not the trap a per-repo answer usually is
 *
 * `work`'s finding of 2026-09-24 records a required parameter arriving in a
 * descendant carrying THE TEMPLATE'S ANSWER through a clean merge, true here and
 * false there, with every gate green. The rule it produced: a per-repo answer
 * must not live at a call site the template also writes.
 *
 * This is a per-SURFACE answer, and it is written where the surface lives. The
 * template writes `chromeFor(page.data)` in the layout, which contains no answer
 * at all; what cascades into a descendant is the declaration for THIS SURFACE,
 * and it arrives in the same commit as the surface it is about. A game repo that
 * keeps `routes/offline` keeps a world that owns the page and therefore keeps a
 * true answer; one that deletes the route deletes this file's only consumer, and
 * `scripts/check-dangling-imports.mjs` says so on the merge that does it. There
 * is no third place for a stale answer to sit, which is exactly what the finding
 * says to arrange.
 */
export const OFFLINE_WORLD_CHROME: SurfaceChrome = {
	navbar: OfflineWorldNavbar,
	bars: [
		chromeBar(
			'offline-world',
			OfflineWorldBar,
			'That the chain is in this tab, and that this browser holds a key that ' +
				'plays for the player. A durable FACT rather than a condition, which ' +
				'is why it takes space in the flow like every other bar instead of ' +
				'floating over the board.',
		),
	],
	// AND NONE OF THE APP'S FOUR, which is a decision rather than an omission.
	// `sending`, `nonce-cache` and `rpc-health` all report the APP's connection,
	// its dispatch ledger and its RPC - none of which is the chain this page is
	// playing against, so each would be a bar describing somebody else's world,
	// which is the defect this whole surface exists to remove. `offline` (the
	// BROWSER reporting no network) is the interesting one and still goes: it is
	// true, and it is the one place in this app where being offline costs the
	// player nothing at all, so reporting it here is an alarm about a condition
	// this page is immune to.
};
