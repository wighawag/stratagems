<script lang="ts">
	import type {PendingTransaction} from 'ethereum-tx-observer';

	export let tx: PendingTransaction;

	function showDetails(tx: PendingTransaction) {
		console.log({tx});
	}
</script>

{#if tx.request.metadata?.type}
	<button on:click={() => showDetails(tx)}>Details</button>
{/if}
