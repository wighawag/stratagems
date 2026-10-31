<!--
	The word over the board while the indexed board is not loaded yet (step 9,
	P9-8): the wood and lines are already drawn, and this says why it is empty.
	Logic-less: the model is `../syncing.ts`'s `boardLoadingWord`.
-->
<svelte:options runes={true} />

<script lang="ts">
	import {derived} from 'svelte/store';
	import {getAppContext} from '$lib';
	import {boardLoadingWord} from '../syncing';

	const context = getAppContext();
	const word = derived(
		[context.viewState, context.game.syncing],
		([$view, $syncing]) =>
			boardLoadingWord({loaded: $view.step === 'Loaded', syncing: $syncing}),
	);
</script>

{#if $word}
	<div
		class="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center"
	>
		<p
			class="rounded-lg bg-background/85 px-4 py-2 text-sm shadow-lg backdrop-blur {$word.failed
				? 'text-red-400'
				: 'text-muted-foreground'}"
			data-testid="board-loading"
		>
			{$word.label}
		</p>
	</div>
{/if}
