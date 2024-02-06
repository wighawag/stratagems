<script lang="ts">
	import {epochInfo} from '$lib/state/Epoch';
	import {FUZD_URI, contractsInfos, defaultRPC, initialContractsInfos} from '$lib/config';
	import {stratagemsView} from '$lib/state/ViewState';
	import {time} from '$lib/blockchain/time';
	import {increaseContractTime} from '$utils/debug';
	import {timeToText} from '$utils/time';
	import {account, connection, contracts, network, switchToSupportedNetwork} from '$lib/blockchain/connection';
	import {parseEther} from 'viem';
	import Executor from './Executor.svelte';
	import TxExecutor from './TxExecutor.svelte';
	import {MINIMUM_REQUIRED_ETH_BALANCE, balance} from '$lib/state/balance';
	import {contractNetwork} from '$lib/blockchain/networks';
	import {status} from '$lib/state/State';
	import SyncingInfo from './SyncingInfo.svelte';

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
			const contract = (contracts as any).TestTokensDistributor;
			// parseEther('0.01')
			return contract.write.topup({account: account.address});
		});
	}

	function any(t: any): any {
		return t;
	}
</script>

<symbol id="warning" viewBox="0 0 32 32">
	<path
		stroke-linecap="round"
		stroke-linejoin="round"
		stroke-width="2"
		d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
	/>
</symbol>
<div class="info" id="info-bar">
	{#if $network.notSupported}
		<div><svg class="font-icon"><use xlink:href="#warning" /></svg> You are connected to the wrong network</div>
		<div>
			<button style="height: fit-content; padding: 0.25rem;" on:click={() => switchToSupportedNetwork()}
				>{`Switch to ${$contractNetwork.name}`}</button
			>
		</div>
	{:else if $connection.state !== 'Connected'}
		{#if defaultRPC}
			<div>You are not connected.</div>
		{:else}
			<div>
				Stratagems is a fully local game and requires a wallet to even read the latest game state. Please Connect to a
				web3 wallet.
			</div>
		{/if}
	{:else if $status.state !== 'IndexingLatest'}
		<SyncingInfo />
	{:else if !$time.synced}
		<span><svg class="font-icon"><use xlink:href="#warning" /></svg>Syncing Time, Please wait... </span>
	{:else if $epochInfo.timeLeftToReveal > 0}
		<span>
			<svg xmlns="http://www.w3.org/2000/svg" class="font-icon" fill="none" viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/></svg
			>

			Please wait while everyone reveal their moves...
		</span>
		<span>{timeToText($epochInfo.timeLeftToReveal)} left</span>
		{#if isAdmin}
			<div>
				<Executor func={() => nextPhase()}>Skip To New Round</Executor>
			</div>
		{/if}
	{:else if $balance.state === 'Loaded'}
		{#if $balance.nativeBalance < MINIMUM_REQUIRED_ETH_BALANCE}
			<div>
				{#if isSepolia}
					<a href="https://sepoliafaucet.com/" target="_blank" rel="noopener noreferrer ">Request test ETH</a>
				{:else}
					You have not enough ETH. Please topup your wallet and come back to get some test tokens to play.
				{/if}
			</div>
		{:else if $balance.tokenBalance === 0n}
			{#if any(initialContractsInfos.contracts)['TestTokensDistributor']}
				<div>
					<TxExecutor btn="btn-sm" func={() => topupToken()}>Get Test token</TxExecutor>
				</div>
			{:else}
				<div>
					<span>
						You do no not have any token to play <a
							class="underline"
							href="https://community.etherplay.io"
							target="_blank"
							rel="noreferer noopener">Ask on our Discord</a
						>
					</span>
				</div>
			{/if}
		{:else}
			{#if $stratagemsView.hasCommitment}
				<span>Please wait until commit phase is over, or replace your moves</span>
			{:else}
				<span>Please make your move.</span>
			{/if}

			<span>{timeToText($epochInfo.timeLeftToCommit)} left</span>
			{#if isAdmin}
				<div>
					<Executor func={() => nextPhase()}>Skip to Reveal Phase</Executor>
				</div>
			{/if}
		{/if}
	{:else if $account.state === 'Disconnected'}
		{#if $account.locked}
			<div>Welcome back! Unlock your account.</div>
			<!-- <div>
				<button>Unlock</button>
			</div> -->
		{:else}
			<div>Connect your wallet to play!</div>
			<!-- <div>
				<button>Connect</button>
			</div> -->
		{/if}
	{:else if $network.notSupported}
		<div><svg class="font-icon"><use xlink:href="#warning" /></svg> You are connected to the wrong network</div>
		<div>
			<button style="height: fit-content; padding: 0.25rem;" on:click={() => switchToSupportedNetwork()}
				>{`Switch to ${$contractNetwork.name}`}</button
			>
		</div>
	{/if}
</div>

<!-- 
<div class="alert alert-info absolute top-32">
	<label for="epoch">Epoch</label>
	<p id="epoch">{$epoch}</p>

	<label for="epochInfo">epochInfo</label>
	<p id="epochInfo">{$epochInfo.timeLeftToCommit}</p>
</div> -->

<style>
	.info {
		display: flex;
		align-items: center;
		flex-direction: row;
		gap: 0.6rem;
		justify-content: space-between;
		width: 100%;
	}
</style>
