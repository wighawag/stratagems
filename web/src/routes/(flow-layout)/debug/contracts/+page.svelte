<script lang="ts">
	import {network} from '$lib/blockchain/connection';

	$: contractList = $network.contracts
		? Object.keys($network.contracts).map((v) => ({name: v, contract: ($network.contracts as any)[v]}))
		: undefined;
</script>

<p>Contracts</p>
{#if contractList}
	<ul>
		{#each contractList as contract}
			<li>{contract.name}: {contract.contract.address}</li>
		{/each}
	</ul>
{/if}

<style>
	ul {
		margin-left: 1rem;
	}
</style>
