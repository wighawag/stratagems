<!--
	STRATAGEMS OFFLINE, IN CONSTRUCTION (P5 of step 6 in
	work/plans/join-template-commit-reveal.md). The home page is the template's and
	offers an offline world; stratagems' is step O of the plan: its contracts on
	the template's in-tab chain (`$lib/embedded`), the indexer folding that chain,
	and the template's `routes/offline/` in place of this page. Until then this
	page says so, so the home page's entry leads somewhere.
-->
<script lang="ts">
	import {route} from '$lib';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import DefaultHead from '$lib/metadata/DefaultHead.svelte';
</script>

<DefaultHead />

<div class="flex flex-col items-center gap-6 px-4 pt-12 pb-12 md:pt-20">
	<h1 class="text-center text-3xl font-bold">Offline is in construction</h1>
	<p class="max-w-md text-center text-muted-foreground">
		A world in this tab, with its own chain and nobody else's moves, is coming.
		Until then, Stratagems is played online.
	</p>
	<Button href={route('/play/')} size="lg">Play online</Button>
</div>
