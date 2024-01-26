<script lang="ts">
	import type {Writable} from 'svelte/store';
	import type {CommitState} from '.';
	import {onMount} from 'svelte';
	import {formatUnits} from 'viem';
	import {initialContractsInfos} from '$lib/config';

	// TODO this does not work for some reason
	const MAX_VALUE = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
	// const MAX_VALUE = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');

	// this works for some reason (one less than max vlue)
	// const MAX_VALUE = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639934');

	export let state: Writable<CommitState>;

	let initialValue: bigint = 0n;
	onMount(() => {
		initialValue = $state.amountToAllow || 0n;
	});

	function setAmount(ev: Event) {
		console.log({ev});
		$state.amountToAllow = (ev.target as HTMLInputElement).checked ? MAX_VALUE : initialValue;
	}

	const symbol = initialContractsInfos.contracts.Stratagems.linkedData.currency.symbol;

	$: formatedValue = $state.amountToAllow
		? $state.amountToAllow === MAX_VALUE
			? 'all'
			: formatUnits(
					$state.amountToAllow,
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
