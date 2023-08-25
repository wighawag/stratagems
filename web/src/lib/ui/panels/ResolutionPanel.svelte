<script lang="ts">
	import {balance, devProvider, account, accountData} from '$lib/web3';
	import {startCommit} from '$lib/ui/flows/commit';
	import {getTransactionToReveal} from './utilts';

	const onchainActions = accountData.onchainActions;

	$: toResolve = getTransactionToReveal($onchainActions);

	async function startResolving(e: MouseEvent) {
		e.preventDefault();
		// commit.start();
		// await startCommit();
	}
</script>

{#if toResolve.length > 0}
	<div class="pointer-events-none select-none fixed top-0 h-full grid place-items-end w-full max-w-full">
		<div class="flex flex-row-reverse sm:m-2 w-full">
			<div class="card w-full sm:w-96 bg-base-content glass">
				<div class="card-body">
					<h2 class="card-title text-primary">Your Move:</h2>
					<p class="text-secondary">
						{toResolve[0].tx.nonce}: {toResolve[0].tx.metadata}
					</p>

					<!-- {`${currentReserve > 0 ? `+ ${currentReserveString} in reserve` : ''}`}. -->
					<div class="mt-4 card-actions justify-end">
						<button class={`pointer-events-auto btn btn-primary`} on:click={startResolving}>Resolve</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
