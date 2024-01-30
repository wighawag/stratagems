<script lang="ts">
	import type {CommitMetadata} from '$lib/account/account-data';
	import {epoch, epochInfo} from '$lib/state/Epoch';
	import {stratagemsView} from '$lib/state/ViewState';
	import {contracts} from '$lib/blockchain/connection';
	import {startAcknowledgFailedReveal, startReveal} from './';
	import {bnReplacer} from 'stratagems-common';
	import {initialContractsInfos} from '$lib/config';

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

	$: commitmentToReveal =
		$stratagemsView.hasCommitmentToReveal?.commit?.tx.metadata?.type === 'commit'
			? $stratagemsView.hasCommitmentToReveal.commit.tx.metadata
			: undefined;

	const symbol = initialContractsInfos.contracts.Stratagems.linkedData.currency.symbol;
</script>

<!--TODO config instead of hardcoded 3600-->
{#if $stratagemsView.hasCommitmentToReveal && $epochInfo.timeLeftToReveal < 3600 - 5 * 60}
	<div class="panel">
		<h2 class="title">Your Move Need to be Revealed</h2>
		<p class="description">
			{#if $stratagemsView.hasCommitmentToReveal.commit}
				{commitmentToReveal?.localMoves.length}
				{symbol} at stake
				<!-- {JSON.stringify($stratagemsView.hasCommitmentToReveal, bnReplacer)} -->
			{:else}
				no commit tx found
			{/if}
		</p>

		<!-- {`${currentReserve > 0 ? `+ ${currentReserveString} in reserve` : ''}`}. -->
		<div class="actions">
			<button class={`pointer-events-auto btn btn-primary`} on:click={startRevealing}>Reveal</button>
		</div>
	</div>
{/if}

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
