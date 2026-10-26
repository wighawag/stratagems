<!--
	What the indexer is doing while the board is behind the chain (the legacy
	`SyncingInfo`). Logic-less: the model is `../syncing.ts`'s.
-->
<svelte:options runes={true} />

<script lang="ts">
	import {getAppContext} from '$lib';

	const {game} = getAppContext();
	const syncing = game.syncing;
</script>

{#if $syncing}
	<div class="mt-2 text-xs" data-testid="syncing">
		<p class={$syncing.failed ? 'text-red-400' : 'text-muted-foreground'}>
			{$syncing.label}
		</p>
		{#if $syncing.percentage !== undefined}
			<progress class="h-1 w-full" value={$syncing.percentage} max="100"
			></progress>
		{/if}
	</div>
{/if}
