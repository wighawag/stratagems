<script lang="ts">
	import {stratagemsView} from '$lib/state/ViewState';
	import {initialContractsInfos} from '$lib/config';
	import {startCancellingCommitment} from '.';

	const symbol = initialContractsInfos.contracts.Stratagems.linkedData.currency.symbol;

	async function cancelCommitment() {
		await startCancellingCommitment();
	}
</script>

{#if $stratagemsView.hasCommitment}
	<div class="panel">
		<h2 class="title">Your commitment</h2>
		<p class="description">
			{$stratagemsView.hasCommitment.tx.metadata.localMoves.length} Lands
		</p>

		<div class="actions">
			<button class={`pointer-events-auto btn btn-primary`} on:click={cancelCommitment}>Cancel</button>
		</div>
	</div>
{/if}

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;

		background-color: var(--color-surface-500);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 repeat;
		image-rendering: pixelated;
	}
	.actions {
		display: flex;
		justify-content: space-between;
	}
</style>
