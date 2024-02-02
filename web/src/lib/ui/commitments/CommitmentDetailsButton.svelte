<script lang="ts">
	import {commitmentDetailsView} from './commitmentsView';
	import type {OnChainAction} from '$lib/account/base';
	import type {CommitMetadata} from '$lib/account/account-data';

	export let commitment: OnChainAction<CommitMetadata>;

	function showDetails(commitment: OnChainAction<CommitMetadata>) {
		$commitmentDetailsView.commitment = commitment;
	}
</script>

<!-- {#if tx.request.metadata?.type} -->
<button on:click={() => showDetails(commitment)}>Details</button>
<!-- {/if} -->
