<script lang="ts">
	import type {Writable} from 'svelte/store';
	import type {CommitState} from '.';
	import {JsonView} from '@zerodevx/svelte-json-view';
	import {serializeJSONWithBigInt} from '$utils/js';
	import {formatEther} from 'viem';

	export let state: Writable<CommitState>;

	$: value = $state.transaction?.value;
	$: formatedValue = value ? formatEther(value) : undefined;
</script>

<div class="form">
	<p>
		This Transaction will Commit Your Moves. You can cancel (or Replace it with new Moves) before the Resolution Phase
		Start.
	</p>

	{#if formatedValue}
		<p>
			The transaction is also sending {formatedValue} ETH so we can reveal on your behalf. This is a worst-case estimate
			and unspend value can be used for further tx.
		</p>
	{/if}

	{#if $state.fuzdData}
		<p>
			Note that we will do our best to reveal your move, but cannot guarantee it. You can always reveal yourself when
			the reveal phase start.
		</p>
	{/if}
	<!-- <JsonView json={serializeJSONWithBigInt($state)} depth={1} /> -->
</div>

<style>
	p {
		margin-bottom: 1rem;
	}
</style>
