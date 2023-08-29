<script lang="ts">
	import {accountData} from '$lib/web3';
	import type {CommitMetadata} from '$lib/web3/account-data';
	import {startReveal} from '../flows/reveal';

	import {getTransactionToReveal} from './utilts';
	import {bnReplacer} from 'stratagems-common';

	const onchainActions = accountData.onchainActions;

	$: toResolve = getTransactionToReveal($onchainActions);

	$: first = toResolve.length > 0 ? toResolve[0] : undefined;

	async function startResolving(e: MouseEvent) {
		e.preventDefault();
		if (!first) {
			throw new Error(`no action to resolve`);
		}
		startReveal(first.hash, first.action.tx.metadata as CommitMetadata);
	}
</script>

{#if first}
	<div class="pointer-events-none select-none fixed top-0 h-full grid place-items-end w-full max-w-full">
		<div class="flex flex-row-reverse sm:m-2 w-full">
			<div class="card w-full sm:w-96 bg-base-content glass">
				<div class="card-body">
					<h2 class="card-title text-primary">Your Move:</h2>
					<p class="text-secondary">
						{first.action.tx.nonce}: {JSON.stringify(first.action.tx.metadata, bnReplacer)}
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
