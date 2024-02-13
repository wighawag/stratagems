<script lang="ts">
	import {blockchainExplorer} from '$lib/config';
	import type {PendingTransactionInclusion} from 'ethereum-tx-observer';

	export let tx: {hash: `0x${string}`; inclusion: PendingTransactionInclusion};

	function computeShortHash(hash: `0x${string}`) {
		return hash.slice(0, 8) + '...';
	}

	$: href = `${blockchainExplorer}/tx/${tx.hash}`;
	$: shortHash = computeShortHash(tx.hash);
</script>

<div class="container">
	<div>
		{#if tx.inclusion === 'Included'}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		{:else if tx.inclusion === 'NotFound'}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
				/>
			</svg>
		{:else if tx.inclusion === 'Cancelled'}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		{:else if tx.inclusion === 'BeingFetched'}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M15.75 15.75l-2.489-2.489m0 0a3.375 3.375 0 10-4.773-4.773 3.375 3.375 0 004.774 4.774zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		{:else if tx.inclusion === 'Broadcasted'}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		{/if}
	</div>
	<div>
		<div class="hash">
			<a {href} target="_blank" rel="noreferer noopener">{shortHash}</a>
		</div>
		<div class="inclusion">{tx.inclusion}</div>
	</div>
</div>

<style>
	.container {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	a {
		text-decoration: underline;
	}

	svg {
		display: inline;
		height: 1.5rem;
		aspect-ratio: 1/1;
	}

	.hash {
		font-weight: bold;
	}
	.inclusion {
		font-size: 0.875rem;
		line-height: 1.25rem;
		opacity: 0.5;
	}
</style>
