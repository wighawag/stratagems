<script lang="ts">
	import {devProvider, account, accountData} from '$lib/blockchain/connection';
	import {initialContractsInfos} from '$lib/config';
	import {encodeFunctionData, formatUnits} from 'viem';
	import {startCommit} from '$lib/actions/commit';
	import {epochInfo} from '$lib/state/Epoch';
	import RevealPanel from './reveal/RevealPanel.svelte';
	import {balance} from '$lib/state/balance';

	const offchainState = accountData.offchainState;

	function clear(e: MouseEvent) {
		e.preventDefault();
		accountData.resetOffchainState();
	}

	async function startCommiting(e: MouseEvent) {
		e.preventDefault();
		// commit.start();
		await startCommit();
	}

	async function topup(e: MouseEvent) {
		await devProvider?.request({
			method: 'eth_sendTransaction',
			params: [
				{
					from: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
					to: initialContractsInfos.contracts.TestTokens.address,
					data: encodeFunctionData({
						abi: [{type: 'function', name: 'transfer', inputs: [{type: 'address'}, {type: 'uint256'}]}],
						args: [account.$state.address, cost - currentBalance],
						functionName: 'transfer',
					}),
				},
			],
		});
	}

	const symbol = initialContractsInfos.contracts.Stratagems.linkedData.currency.symbol;

	$: cost =
		$offchainState.moves === undefined
			? 0n
			: BigInt($offchainState.moves.length) *
				BigInt(initialContractsInfos.contracts.Stratagems.linkedData.numTokensPerGems.slice(0, -1));
	$: costString = formatUnits(
		cost,
		Number(initialContractsInfos.contracts.Stratagems.linkedData.currency.decimals.slice(0, -1)),
	);

	$: currentReserve = $balance.reserve;
	$: currentReserveString = formatUnits(
		currentReserve,
		Number(initialContractsInfos.contracts.Stratagems.linkedData.currency.decimals.slice(0, -1)),
	);

	$: currentBalance = $balance.tokenBalance;
	$: currentBalnceString = formatUnits(
		currentBalance,
		Number(initialContractsInfos.contracts.Stratagems.linkedData.currency.decimals.slice(0, -1)),
	);

	$: depositNeeded = currentReserve < cost ? cost - currentReserve : 0n;
	$: depositNeededString = formatUnits(
		depositNeeded,
		Number(initialContractsInfos.contracts.Stratagems.linkedData.currency.decimals.slice(0, -1)),
	);

	$: enough = currentBalance + currentReserve >= cost; // TODO + gascost for ETH
</script>

{#if $epochInfo.isActionPhase}
	{#if $offchainState.moves && $offchainState.moves.length > 0}
		<div class="panel">
			<h2 class="title">Your Move:</h2>
			<p class="message">
				This moves will cost {costString}
				{symbol}. You'll need to deposit {depositNeededString} extra
				{symbol} because you have {currentReserveString} in reserve.
				<span class={`${enough ? '' : 'not-enough'}`}
					>{`${enough ? ', ' : 'but '}`}you have {currentBalnceString}
					{symbol}.</span
				>
			</p>
			<div class="actions">
				<button on:click={clear}>Clear</button>

				<button class="primary" disabled={!enough} on:click={startCommiting}>Commit</button>
				{#if !enough}
					<!-- <button class={`pointer-events-auto btn btn-primary`} on:click={topup}>Topup</button> -->
				{/if}
			</div>
		</div>
	{/if}
{/if}

<RevealPanel />

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;

		background-color: var(--color-surface-500);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 repeat;
		image-rendering: pixelated;
	}
	.actions {
		display: flex;
		justify-content: space-between;
	}
</style>
