<script lang="ts">
	/**
	 * WHAT AN OFFLINE WORLD HAS TO SAY THAT WILL NOT FIT IN A NAVBAR.
	 *
	 * Two sentences, and neither is decoration. That everything below runs against
	 * a chain in this tab and nothing leaves the browser is the promise the whole
	 * route is making. That this browser holds a key which plays for the player is
	 * the step an online game would have CHARGED them for, done silently here
	 * because offline it is a question with one answer - and a player who met it
	 * for the first time on a real chain, unexplained, in front of a board they had
	 * already decided to play, is the experience that sentence exists to prevent.
	 *
	 * A BAR RATHER THAN MARKUP IN THE ROUTE, which is where this text used to live.
	 * The route's copy sat INSIDE the content region, so the board got the region
	 * minus a strip the shell knew nothing about; as a bar it is chrome, so the
	 * shell shrinks the region by exactly its height and the board can ask for
	 * `h-full` and mean it. Same pixels, one fewer thing computing them. It is also
	 * what makes the strip arrive and leave with the navbar it belongs to, rather
	 * than being a thing the page happens to draw first.
	 *
	 * SELF-GATING AND ZERO-PROP, like every bar (`core/ui/chrome.ts`), and reading
	 * an app-scoped module rather than a context for the reason spelled out in
	 * `OfflineWorldNavbar.svelte`: this is rendered by the layout, above the
	 * subtree where the world's context exists.
	 *
	 * IT DOES NOT REPEAT THE CHAIN ID, which the navbar carries. One fact, one
	 * place: a second copy is a second thing to keep true.
	 */
	import {offlineWorld} from '$lib/offline';
	import {THE_KEY_THIS_BROWSER_PLAYS_WITH} from '$lib/offline-lobby';
</script>

{#if $offlineWorld.step === 'Ready'}
	<!-- No `sticky`, no offset, no z-index: `AppShell` pins the whole bar group,
	     and a bar that pinned itself is how two live conditions once landed exactly
	     on top of each other. See the note in `core/ui/chrome.ts`. -->
	<div
		class="border-b border-dashed border-muted-foreground/40 bg-muted/40 px-4 py-2 text-center text-sm"
	>
		Everything below runs against a chain inside this tab. Nothing leaves the
		browser.
		<p class="mt-1 text-xs text-muted-foreground">
			{THE_KEY_THIS_BROWSER_PLAYS_WITH}
		</p>
	</div>
{/if}
