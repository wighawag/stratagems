<script lang="ts">
	import type {PendingTransaction} from 'ethereum-tx-observer';
	import {transactionDetailsView} from './transactionsView';

	export let tx: PendingTransaction;

	function showDetails(tx: PendingTransaction) {
		$transactionDetailsView.tx = tx;
	}
</script>

<!-- {#if tx.request.metadata?.type} -->
<button on:click={() => showDetails(tx)}>Details</button>
<!-- {/if} -->
