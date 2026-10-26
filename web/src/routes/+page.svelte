<script lang="ts">
	import {route} from '$lib';
	import {url} from '$lib/kit/paths';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import DefaultHead from '../lib/metadata/DefaultHead.svelte';
	import {brand} from '$lib/metadata/brand';
</script>

<!-- THE GAME MENU, AND THE SAME FILE IN EVERY GAME. What differs between games is
     the title, and that comes from `src/web-config.json` through
     `$lib/metadata/brand`: a `logo` if the game has one, its `name` as text if
     it does not. Rebrand there, not here, so that whatever improves this page
     reaches every game without a conflict. -->

<DefaultHead />

<div class="flex flex-col items-center gap-10 px-4 pt-12 pb-12 md:pt-20">
	<!-- The heading is the title either way, so it is named by `name` in both
	     cases: the image's `alt` becomes the heading's accessible name. -->
	<h1 class="text-center">
		{#if brand.logo}
			<img
				src={url(brand.logo)}
				alt={brand.name}
				class="mx-auto max-h-56 w-auto max-w-[min(90vw,40rem)]"
			/>
		{:else}
			<span class="text-5xl font-bold tracking-tight md:text-7xl"
				>{brand.name}</span
			>
		{/if}
	</h1>

	<nav class="flex w-full max-w-sm flex-col gap-4" aria-label="Game menu">
		<Button
			href={route('/play/')}
			size="lg"
			class="h-14 w-full text-xl font-semibold">Online</Button
		>
		<!-- OFFLINE IS A WORLD, NOT A DEMO: a chain in this tab, which is a route of
		     the game's own (`routes/offline/` and `$lib/offline.ts`), not the stem's
		     `/offline-demo`.

		     WHAT THE ENTRY PROMISES IS THAT CHAIN, and nothing about what is at
		     stake in it. This file is identical in every game, and what a game
		     risks is the one thing they are guaranteed to disagree about, so a
		     word here naming one answer would be false somewhere downstream.

		     A GAME INHERITS THIS ENTRY AND NOT THE WORLD BEHIND IT. `$lib/embedded`
		     is the mechanism and cascades unchanged; `$lib/offline.ts` names the
		     game's contracts, deploy scripts and stake, so a game that replaces the
		     game replaces that too, and `offline.e2e.ts` is what says it can still
		     finish a cycle. -->
		<Button
			href={route('/offline/')}
			size="lg"
			variant="outline"
			class="h-14 w-full text-xl font-semibold">Offline</Button
		>
	</nav>
</div>
