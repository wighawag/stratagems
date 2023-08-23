<script lang="ts">
	import type {Writable} from 'svelte/store';
	import type {CommitState} from '.';
	import {onMount} from 'svelte';

	export let state: Writable<CommitState>;

	let initialValue: bigint = 0n;
	onMount(() => {
		initialValue = $state.amountToAdd || 0n;
	});

	function setAmount(ev: Event) {
		console.log({ev});
		$state.amountToAdd = (ev.target as HTMLInputElement).checked
			? BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')
			: initialValue;
	}
</script>

<p>allow the spending to {$state.amountToAdd} tokens</p>

<input type="checkbox" on:change={setAmount} value={false} />
