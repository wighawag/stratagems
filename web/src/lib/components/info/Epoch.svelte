<script lang="ts">
	import {epoch, epochInfo} from '$lib/blockchain/state/Epoch';
	import {FUZD_URI, contractsInfos, initialContractsInfos} from '$lib/config';
	import {stratagemsView} from '$lib/blockchain/state/ViewState';
	import {time} from '$lib/time';
	import {increaseContractTime} from '$lib/utils/debug';
	import {timeToText} from '$lib/utils/time';
	import {account, balance, contracts} from '$lib/web3';
	import {parseEther} from 'viem';
	import Executor from '../utilities/Executor.svelte';
	import TxExecutor from '../utilities/TxExecutor.svelte';

	$: isAdmin = $account.address?.toLowerCase() === $contractsInfos.contracts.Stratagems.linkedData.admin?.toLowerCase();
	async function nextPhase() {
		const isActionPhase = $epochInfo.isActionPhase;
		if (!isActionPhase) {
			await fetch(`${FUZD_URI}/processQueue`)
				.then((v) => v.text())
				.then((v) => console.log(v));
		}
		const timeToSkip = isActionPhase ? $epochInfo.timeLeftToCommit : $epochInfo.timeLeftToReveal;
		console.log({timeToSkip: timeToText(timeToSkip)});
		const hash = await increaseContractTime(timeToSkip);

		if (isActionPhase) {
			if (hash) {
				// TODO wait for inclusion
				await fetch(`${FUZD_URI}/processQueue`)
					.then((v) => v.text())
					.then((v) => console.log(v));
			} else {
			}
		}
	}

	async function nextEpoch() {
		const isActionPhase = $epochInfo.isActionPhase;
		const timeToSkip = isActionPhase ? $epochInfo.timeLeftToCommit : $epochInfo.timeLeftToReveal;
		console.log({timeToSkip: timeToText(timeToSkip)});
		const hash = await increaseContractTime(timeToSkip);

		if (isActionPhase) {
			if (hash) {
				// TODO wait for inclusion
				await fetch(`${FUZD_URI}/processQueue`)
					.then((v) => v.text())
					.then((v) => console.log(v));
				await increaseContractTime(parseInt($contractsInfos.contracts.Stratagems.linkedData.revealPhaseDuration));
			} else {
			}
		}
	}

	const isSepolia = (initialContractsInfos.chainId as any) === '11155111';

	async function topupToken() {
		return await contracts.execute(async ({contracts, account}) => {
			const contract = contracts.TestTokens;
			// parseEther('0.01')
			return contract.write.topup({account: account.address, value: 0n});
		});
	}
</script>

{#if !$time.synced}
	<div class="alert alert-warning absolute">
		<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"
			><path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/></svg
		>
		<p>Syncing ..., you might need to connect your wallet.</p>
	</div>
{:else if $epochInfo.timeLeftToReveal > 0}
	<div class="alert alert-warning absolute">
		<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"
			><path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/></svg
		>
		<p>
			Please wait while everyone reveal their moves... <svg
				class="stroke-current shrink-0 h-6 w-6 inline"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		</p>
		<p>{timeToText($epochInfo.timeLeftToReveal)} left</p>
		{#if isAdmin}<Executor btn="btn-sm" func={() => nextPhase()}>Skip To New Round</Executor>{/if}
	</div>
{:else if $balance.state === 'Loaded'}
	{#if $balance.nativeBalance < parseEther('0.001')}
		<div class="alert alert-warning absolute">
			{#if isSepolia}
				<a href="https://sepoliafaucet.com/" target="_blank" rel="noopener noreferrer ">Request test ETH</a>
			{:else}
				You have not enough ETH. Please topup your wallet and come back to get some test tokens to play.
			{/if}
		</div>
	{:else if $balance.tokenBalance === 0n}
		<div class="alert alert-warning absolute">
			<TxExecutor btn="btn-sm" func={() => topupToken()}>Get Test token</TxExecutor>
		</div>
	{:else}
		<div class="alert alert-info absolute">
			{#if $stratagemsView.hasCommitment}
				<p>Please wait until commit phase is over, or replace your moves</p>
			{:else}
				<p>Please make your move.</p>
			{/if}

			<p>{timeToText($epochInfo.timeLeftToCommit)} left</p>

			{#if isAdmin}<Executor btn="btn-sm" func={() => nextPhase()}>Skip to Reveal Phase</Executor>{/if}
		</div>
	{/if}
{:else}
	<div class="alert alert-info absolute">please wait ...</div>
{/if}
<!-- 
<div class="alert alert-info absolute top-32">
	<label for="epoch">Epoch</label>
	<p id="epoch">{$epoch}</p>

	<label for="epochInfo">epochInfo</label>
	<p id="epochInfo">{$epochInfo.timeLeftToCommit}</p>
</div> -->
