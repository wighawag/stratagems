<!--
	Winnings: the shares of dead cells owed to the player, collected from the
	wallet with `pokeMultiple` (P7 of step 6c). Logic-less: `../winnings.ts`
	derives what is owed, `./panels.ts` words it.
-->
<svelte:options runes={true} />

<script lang="ts">
	import {derived} from 'svelte/store';
	import {getAppContext} from '$lib';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import {describeWinnings} from './panels';

	const {game} = getAppContext();
	const winnings = game.winnings;
	const model = derived(winnings, ($winnings) =>
		describeWinnings($winnings, game.config.currency),
	);
</script>

{#if $model}
	<div
		class="pointer-events-auto w-64 rounded-lg bg-background/85 p-3 shadow-lg backdrop-blur"
		data-testid="winnings"
	>
		<p class="text-sm font-semibold">{$model.label}</p>
		<p class="mt-1 text-xs text-muted-foreground">
			Owed to {$model.cells} of your cells by neighbours that died.
		</p>
		<Button
			size="sm"
			class="mt-2"
			disabled={$model.busy}
			onclick={() => winnings.collect()}
		>
			{$model.busy ? 'Collecting...' : 'Collect'}
		</Button>
		{#if $model.error}
			<p class="mt-2 text-xs text-red-400">{$model.error}</p>
		{/if}
	</div>
{/if}
