<script lang="ts">
	import type {Writable} from 'svelte/store';
	import type {CommitState} from '.';
	import {onMount} from 'svelte';
	import {formatUnits} from '$utils/ui/text';
	import {initialContractsInfos} from '$lib/config';

	// TODO this does not work for some reason
	const MAX_VALUE = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
	// const MAX_VALUE = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');

	// this works for some reason (one less than max vlue)
	// const MAX_VALUE = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639934');

	export let state: Writable<CommitState>;

	let initialValue: bigint = 0n;
	onMount(() => {
		initialValue = $state.tokenData?.amountToAllow || 0n;
	});

	function setAmount(ev: Event) {
		console.log({ev});
		const amountToAllow = (ev.target as HTMLInputElement).checked ? MAX_VALUE : initialValue;
		if ($state.tokenData) {
			$state.tokenData.amountToAllow = amountToAllow;
		} else {
			$state.tokenData = {amountToAllow, amountToAdd: amountToAllow};
		}
	}

	const symbol = initialContractsInfos.contracts.Stratagems.linkedData.currency.symbol;

	$: formatedValue = $state.tokenData?.amountToAllow
		? $state.tokenData.amountToAllow === MAX_VALUE
			? 'all'
			: formatUnits(
					$state.tokenData.amountToAllow,
					Number(initialContractsInfos.contracts.Stratagems.linkedData.currency.decimals),
				)
		: '0';
</script>

<div class="form">
	<p>You'll be asked to allow the spending of {formatedValue} {symbol}.</p>
	<div class="value">
		<input id="all" type="checkbox" on:change={setAmount} value={false} />
		<label for="all">allow all {symbol}</label>
	</div>
</div>

<style>
	.form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
		align-items: center;
	}
	.value {
		display: flex;
		gap: 1rem;
	}
</style>
