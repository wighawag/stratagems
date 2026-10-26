<!--
	Test gems: free gems from the deployment's distributor, on the deployments
	that have one (P2 of step 6c). Logic-less: `../test-gems.ts` sends,
	`./panels.ts` words it.
-->
<svelte:options runes={true} />

<script lang="ts">
	import {derived} from 'svelte/store';
	import {getAppContext} from '$lib';
	import Button from '$lib/shadcn/ui/button/button.svelte';
	import {describeTestGems} from './panels';

	const {game} = getAppContext();
	const testGems = game.testGems;
	const model = derived([testGems, game.reserve], ([$testGems, $reserve]) =>
		describeTestGems({
			state: $testGems,
			tokenBalance: $reserve.step === 'Loaded' ? $reserve.tokenBalance : undefined,
			stakeAmount: game.config.stakeAmount,
			currency: game.config.currency,
		}),
	);
</script>

{#if $model}
	<div class="pointer-events-auto">
		{#if $model.hint}
			<p class="mb-1 max-w-sm text-xs text-muted-foreground">{$model.hint}</p>
		{/if}
		<Button
			size="sm"
			variant="secondary"
			data-testid="get-test-gems"
			disabled={$model.busy}
			onclick={() => testGems.get()}
		>
			{$model.label}
		</Button>
		{#if $model.error}
			<p class="mt-1 max-w-sm text-xs text-red-400">{$model.error}</p>
		{/if}
	</div>
{/if}
