<script lang="ts">
	import {epochInfo} from '$lib/state/Epoch';
	import RevealPanel from './reveal/RevealPanel.svelte';
	import CommitPanel from './commit/CommitPanel.svelte';
	import {accountData} from '$lib/blockchain/connection';
	import {stratagemsView} from '$lib/state/ViewState';
	import CommitCancelPanel from './commit-cancel/CommitCancelPanel.svelte';

	const offchainState = accountData.offchainState;

	$: commitmentToRevealWithFuzd =
		$stratagemsView.hasCommitmentToReveal?.commit?.tx.metadata?.type === 'commit' &&
		$stratagemsView.hasCommitmentToReveal.commit.tx.metadata.autoReveal &&
		$stratagemsView.hasCommitmentToReveal.commit.tx.metadata.autoReveal.type === 'fuzd';
</script>

<!--TODO config instead of hardcoded 3600-->

{#if $stratagemsView.hasCommitmentToReveal && (!commitmentToRevealWithFuzd || $epochInfo.timeLeftToReveal < 3600 - 5 * 60)}
	<RevealPanel />
{:else if $epochInfo.isActionPhase && $offchainState.moves && $offchainState.moves.epoch === $epochInfo.epoch && $offchainState.moves.list.length > 0}
	<CommitPanel />
{:else if $epochInfo.isActionPhase && $stratagemsView.hasCommitment}
	<CommitCancelPanel />
{/if}
