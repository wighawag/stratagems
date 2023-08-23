<script lang="ts">
	import type {Writable} from 'svelte/store';
	import type {CommitState} from '.';
	import {onMount} from 'svelte';
	import {formatUnits} from 'viem';
	import {initialContractsInfos} from '$lib/config';

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

	const symbol = initialContractsInfos.contracts.Stratagems.linkedData.currency.symbol;

	$: formatedValue = $state.amountToAdd
		? $state.amountToAdd === BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')
			? 'all'
			: formatUnits(
					$state.amountToAdd,
					Number(initialContractsInfos.contracts.Stratagems.linkedData.currency.decimals.slice(0, -1)),
			  )
		: '0';
</script>

<p class="py-4">allow the spending of {formatedValue} {symbol}.</p>

<!-- <div class="modal-action"> -->
<!-- if there is a button, it will close the modal -->
<input id="all" type="checkbox" on:change={setAmount} value={false} />
<label for="all">allow all {symbol}</label>
<!-- </div> -->
