<script lang="ts">
	import type {Writable} from 'svelte/store';
	import type {CommitState} from '.';
	import {formatEther} from 'viem';

	export let state: Writable<CommitState>;

	$: amountAvailable = $state.balanceData?.nativeToken;
	$: amountRequired = $state.balanceData?.amountRequired;
	$: formatedAvailable = amountAvailable ? formatEther(amountAvailable) : undefined;
	$: formatedRequired = amountRequired ? formatEther(amountRequired) : undefined;
</script>

<div class="form">
	<p>
		You need {formatedRequired} ETH but you only got {formatedAvailable}
	</p>

	<p>Note that this includes extra ETH sent to a remote account used to reveal on your behalf.</p>
</div>

<style>
	p {
		margin-bottom: 1rem;
	}
</style>
