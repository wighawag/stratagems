<script lang="ts">
	import {actionState} from '$lib/action/ActionState';
	import {balance} from '$lib/web3/index';
	import {initialContractsInfos} from '$lib/config';
	import {commitFlow} from '$lib/ui/flows/CommitFlow';
	import {formatEther, formatUnits} from 'viem';
	function clear(e: MouseEvent) {
		e.preventDefault();
		actionState.clear();
	}

	function commit(e: MouseEvent) {
		e.preventDefault();
		commitFlow.requireConfirmation();
	}

	$: cost =
		BigInt($actionState.length) *
		BigInt(initialContractsInfos.contracts.Stratagems.linkedData.numTokensPerGems.slice(0, -1));
	$: costString = formatUnits(
		cost,
		Number(initialContractsInfos.contracts.Stratagems.linkedData.currency.decimals.slice(0, -1)),
	);
</script>

{#if $actionState.length > 0}
	<div class="pointer-events-none select-none fixed top-0 h-full grid place-items-end w-full max-w-full">
		<div class="flex flex-row-reverse sm:m-2 w-full">
			<div class="card w-full sm:w-96 bg-base-content glass">
				<div class="card-body">
					<h2 class="card-title text-primary">Your Move:</h2>
					<p class="text-secondary">
						You'll stake {costString}
						{initialContractsInfos.contracts.Stratagems.linkedData.currency.symbol}. you have {formatEther(
							$balance.balance,
						)} ETH.
					</p>
					<div class="mt-4 card-actions justify-end">
						<button class="pointer-events-auto btn btn-neutral" on:click={clear}>Clear</button>
						<button class="pointer-events-auto btn btn-primary" on:click={commit}>Commit</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
