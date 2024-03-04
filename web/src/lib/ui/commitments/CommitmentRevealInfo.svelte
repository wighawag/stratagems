<script lang="ts">
	import type {CommitMetadata} from '$lib/account/account-data';
	import type {OnChainAction} from '$lib/account/base';
	import {FUZD_URI, blockchainExplorer} from '$lib/config';

	export let commitment: {hash: `0x${string}`; action: OnChainAction<CommitMetadata>};

	function computeShortHash(hash: `0x${string}`) {
		return hash.slice(0, 8) + '...';
	}
</script>

{#if commitment.action.revealTx}
	<div class="font-bold">
		Manual
		<a
			class="underline"
			href={`${blockchainExplorer}/tx/${commitment.action.revealTx.hash}`}
			target="_blank"
			rel="noreferer noopener">{computeShortHash(commitment.action.revealTx.hash)}</a
		>
	</div>
	<div class="text-sm opacity-50">{commitment.action.revealTx.inclusion}</div>
{:else if commitment.action.tx.metadata?.type === 'commit' && commitment.action.tx.metadata.autoReveal && commitment.action.tx.metadata.autoReveal.type === 'fuzd'}
	{#if commitment.action.fuzd}
		{#if commitment.action.fuzd.state === 'replaced'}
			Replaced
		{:else if commitment.action.fuzd.state}
			<div class="font-bold">
				FUZD
				<a
					class="underline"
					href={`${FUZD_URI}/queuedExecution/${commitment.action.fuzd.state.chainId}/${commitment.action.fuzd.state.account}/${commitment.action.fuzd.state.slot}`}
					target="_blank"
					rel="noreferer noopener">{`will reveal on ${commitment.action.fuzd.state.checkinTime}`}</a
				>
			</div>
			<div class="text-sm opacity-50">...</div>
		{:else}
			Error
		{/if}
	{:else}
		Waiting for tx...
	{/if}
{:else}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		stroke-width="1.5"
		stroke="currentColor"
		class="w-6 h-6"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M15.75 15.75l-2.489-2.489m0 0a3.375 3.375 0 10-4.773-4.773 3.375 3.375 0 004.774 4.774zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
		/>
	</svg>
{/if}
