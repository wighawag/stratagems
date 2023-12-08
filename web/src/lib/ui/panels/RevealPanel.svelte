<script lang="ts">
	import type {CommitMetadata} from '$lib/account/account-data';
	import {epoch, epochInfo} from '$lib/blockchain/state/Epoch';
	import {stratagemsView} from '$lib/blockchain/state/ViewState';
	import {contracts} from '$lib/web3';
	import {startAcknowledgFailedReveal, startReveal} from '../flows/reveal';
	import {bnReplacer} from 'stratagems-common';

	// const onchainActions = accountData.onchainActions;

	// $: toReveal = getTransactionToReveal($onchainActions);

	// $: first = toReveal.length > 0 ? toReveal[0] : undefined;

	async function startRevealing(e: MouseEvent) {
		e.preventDefault();
		if (!$stratagemsView.hasCommitmentToReveal) {
			throw new Error(`no action to reveal`);
		}
		if ($stratagemsView.hasCommitmentToReveal.commit) {
			if ($stratagemsView.hasCommitmentToReveal.commit.tx.metadata?.epoch !== $epoch) {
				startAcknowledgFailedReveal(
					$stratagemsView.hasCommitmentToReveal.commit.hash,
					$stratagemsView.hasCommitmentToReveal.commit.tx.metadata as CommitMetadata,
				);
			} else {
				startReveal(
					$stratagemsView.hasCommitmentToReveal.commit.hash,
					$stratagemsView.hasCommitmentToReveal.commit.tx.metadata as CommitMetadata,
				);
			}
		} else {
			// TODO use flow
			await contracts.execute(async ({contracts, account}) => {
				console.log(account);
				await contracts.Stratagems.write.acknowledgeMissedRevealByBurningAllReserve({account: account.address});
			});
		}
	}
</script>

<!--TODO config instead of hardcoded 3600-->
{#if $stratagemsView.hasCommitmentToReveal && $epochInfo.timeLeftToReveal < 3600 - 5 * 60}
	<div class="pointer-events-none select-none fixed top-0 h-full grid place-items-end w-full max-w-full">
		<div class="flex flex-row-reverse sm:m-2 w-full">
			<div class="card w-full sm:w-96 bg-base-content glass">
				<div class="card-body">
					<h2 class="card-title text-primary">Your Move:</h2>
					<p class="text-secondary">
						{#if $stratagemsView.hasCommitmentToReveal.commit}
							{JSON.stringify($stratagemsView.hasCommitmentToReveal, bnReplacer)}
						{:else}
							no commit tx found
						{/if}
					</p>

					<!-- {`${currentReserve > 0 ? `+ ${currentReserveString} in reserve` : ''}`}. -->
					<div class="mt-4 card-actions justify-end">
						<button class={`pointer-events-auto btn btn-primary`} on:click={startRevealing}>Reveal</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
