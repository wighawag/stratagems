<script lang="ts">
	import {devProvider, account, accountData} from '$lib/blockchain/connection';
	import {initialContractsInfos} from '$lib/config';
	import {encodeFunctionData} from 'viem';
	import {startCommit} from '$lib/actions/commit';
	import {MINIMUM_REQUIRED_ETH_BALANCE, balance} from '$lib/state/balance';
	import {formatUnits} from '$utils/ui/text';

	const decimals = Number(initialContractsInfos.contracts.Stratagems.linkedData.currency.decimals);

	const offchainState = accountData.offchainState;

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
			: BigInt($offchainState.moves.list.length) *
				BigInt(initialContractsInfos.contracts.Stratagems.linkedData.numTokensPerGems.slice(0, -1));
	$: costString = formatUnits(cost, decimals);

	$: currentReserve = $balance.reserve;
	$: currentReserveString = formatUnits(currentReserve, decimals);

	$: currentBalance = $balance.tokenBalance;
	$: currentBalnceString = formatUnits(currentBalance, decimals);

	$: depositNeeded = currentReserve < cost ? cost - currentReserve : 0n;
	$: depositNeededString = formatUnits(depositNeeded, decimals);

	$: enough = currentBalance + currentReserve >= cost; // TODO + gascost for ETH

	$: enoughETH = $balance.nativeBalance >= MINIMUM_REQUIRED_ETH_BALANCE;

	function clear(e: MouseEvent) {
		e.preventDefault();
		accountData.resetOffchainMoves();
	}

	async function startCommiting(e: MouseEvent) {
		e.preventDefault();
		// commit.start();
		await startCommit();
	}
</script>

<div class="panel">
	<h2 class="title">Your Move:</h2>
	<p class="message">
		This moves will cost {costString}
		{symbol}. You'll need to deposit {depositNeededString} extra
		{symbol} because you have {currentReserveString} in reserve.
		<span class={`${enough ? '' : 'not-enough'}`}
			>{`${enough ? ', you' : 'but you only'}`} have {currentBalnceString}
			{symbol} in your wallet.</span
		>
	</p>
	{#if $balance.nativeBalance < MINIMUM_REQUIRED_ETH_BALANCE}
		<p style="color: red;">You need more ETH to transact on this chain.</p>
	{/if}

	<div class="actions">
		<button on:click={clear}>Clear</button>

		<button class="primary" disabled={!enough || !enoughETH} on:click={startCommiting}>Commit</button>
	</div>
</div>

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

	.not-enough {
		color: red;
	}
</style>
