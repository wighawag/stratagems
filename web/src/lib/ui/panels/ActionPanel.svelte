<script lang="ts">
	import {actionState} from '$lib/action/ActionState';
	import {balance, devProvider, account} from '$lib/web3';
	import {initialContractsInfos} from '$lib/config';
	import {encodeFunctionData, formatEther, formatUnits} from 'viem';
	import {startCommit} from '$lib/ui/flows/commit';
	function clear(e: MouseEvent) {
		e.preventDefault();
		actionState.clear();
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
		BigInt($actionState.length) *
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

	$: currentBalance = $balance.balance;
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

{#if $actionState.length > 0}
	<div class="pointer-events-none select-none fixed top-0 h-full grid place-items-end w-full max-w-full">
		<div class="flex flex-row-reverse sm:m-2 w-full">
			<div class="card w-full sm:w-96 bg-base-content glass">
				<div class="card-body">
					<h2 class="card-title text-primary">Your Move:</h2>
					<p class="text-secondary">
						This moves will cost {costString}
						{symbol}. You'll need to deposit {depositNeededString} extra
						{symbol} because you have {currentReserveString} in reserve.
						<span class={`${enough ? '' : 'text-red-300'}`}
							>{`${enough ? ', ' : 'but '}`}you have {currentBalnceString}
							{symbol}.</span
						>
					</p>
					<!-- {`${currentReserve > 0 ? `+ ${currentReserveString} in reserve` : ''}`}. -->
					<div class="mt-4 card-actions justify-end">
						<button class="pointer-events-auto btn btn-neutral" on:click={clear}>Clear</button>
						<!-- <button class={`pointer-events-auto btn btn-primary ${enough ? '' : 'btn-disabled'}`} on:click={commit}
							>Commit</button
						> -->
						{#if enough}
							<button class={`pointer-events-auto btn btn-primary`} on:click={startCommiting}>Commit</button>
						{:else}
							<!-- <button class={`pointer-events-auto btn btn-primary`} on:click={topup}>Topup</button> -->
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
