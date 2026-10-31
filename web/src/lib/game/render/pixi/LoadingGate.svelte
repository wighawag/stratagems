<!--
	What the player looks at while the sprite bundle arrives.

	The renderer-agnostic half of the art pipeline: it turns a PROGRESS STORE
	into something on screen and has no opinion about what is being loaded. It
	follows the pipeline onto `with/pixi-js` rather than shipping to `main`,
	because on `main` there is nothing to load and a gate with no loader is one
	more unexercised module (D11).

	IT GATES THE SURFACE, NOT THE APP, and that is a deliberate difference from
	the game this came from. reveal-or-die's splash covers the whole application,
	which is right for a game with a brand to show; doing that here would mean
	editing `routes/+layout.svelte` or `routes/play/+page.svelte`, and both are
	shared files that `main` keeps developing. Rendered by the pixi host instead,
	it costs the branch NO shared-file edit at all, and it covers exactly the
	region that is genuinely unpainted while the bundle is in flight. A game that
	wants a branded full-screen splash builds one over the same store; that is
	its brand, and Decision 2 says brand stays with the game.

	AN OVERLAY, NOT A BLOCK. The canvas mounts and the scene is built underneath
	it, so nothing is delayed by waiting - the board is simply not looked at
	until it can be drawn properly. `CellObject` falls back to vector graphics
	when there is no sheet, so the board is never blank behind this either.

	It is driven by a store that reaches 1 EVEN WHEN LOADING FAILS (see
	`assets.ts`). That is what stops a 404 on the bundle turning into a loading
	screen the player can never get past, and it is the single most important
	property of this component's input.
-->
<script lang="ts">
	import {assetProgress} from './assets';

	// A UI-only easing of the progress number: it arrives in a few large steps
	// for a small bundle, and a bar that jumps from 0 to 1 reads as broken.
	const percent = $derived(Math.round(Math.min(1, $assetProgress) * 100));
	const done = $derived($assetProgress >= 1);
</script>

{#if !done}
	<div
		class="pointer-events-none absolute inset-0 flex items-center justify-center"
		role="status"
		aria-live="polite"
	>
		<div class="flex w-48 flex-col items-center gap-2">
			<p class="text-xs text-slate-300">Loading the board art…</p>
			<div class="h-1 w-full overflow-hidden rounded bg-slate-700">
				<div
					class="h-full bg-slate-300 transition-[width] duration-200"
					style="width: {percent}%"
				></div>
			</div>
		</div>
	</div>
{/if}
