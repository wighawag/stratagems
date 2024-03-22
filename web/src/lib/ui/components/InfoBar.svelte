<script lang="ts">
	import {epochInfo} from '$lib/state/Epoch';
	import {FUZD_URI, contractsInfos, defaultRPC, initialContractsInfos} from '$lib/config';
	import {stratagemsView} from '$lib/state/ViewState';
	import {every3Seconds} from '$lib/blockchain/time';
	import {increaseContractTime} from '$utils/debug';
	import {timeToText} from '$utils/time';
	import {account, connection, viemClient, network, switchToSupportedNetwork} from '$lib/blockchain/connection';
	import Executor from './Executor.svelte';
	import TxExecutor from './TxExecutor.svelte';
	import {MINIMUM_REQUIRED_ETH_BALANCE, balance} from '$lib/state/balance';
	import {contractNetwork} from '$lib/blockchain/networks';
	import {status} from '$lib/state/State';
	import SyncingInfo from './SyncingInfo.svelte';
	import {parseEther} from 'viem';

	$: isAdmin = $account.address?.toLowerCase() === $contractsInfos.contracts.Stratagems.linkedData.admin?.toLowerCase();

	$: timeLeftForNextPhase = $epochInfo.timeLeftToReveal > 0 ? $epochInfo.timeLeftToReveal : $epochInfo.timeLeftToCommit;

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
		return await viemClient.execute(async ({client, network: {contracts}, account}) => {
			const contract = (contracts as any).TestTokensDistributor;
			// parseEther('0.01')
			return client.wallet.writeContract({...contract, functionName: 'topup', account: account.address});
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
			{#if $every3Seconds.synced}
				<span>{timeToText(timeLeftForNextPhase)} left</span>
			{/if}
		{:else}
			<div>
				Stratagems is a fully local client and we do not run any blockchain node for it. As such, it requires a wallet
				to even read the latest game state. Please Connect to a web3 wallet.
			</div>
		{/if}
	{:else if $status.state !== 'IndexingLatest'}
		<SyncingInfo />
	{:else if !$every3Seconds.synced}
		<span>Syncing Time, Please wait... </span>
		<span><svg class="font-icon"><use xlink:href="#warning" /></svg></span>
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
		<span>{timeToText(timeLeftForNextPhase)} left</span>
		{#if isAdmin}
			<div>
				<Executor func={() => nextPhase()}>Skip To New Round</Executor>
			</div>
		{/if}
	{:else if $balance.state === 'Loaded'}
		{#if $balance.tokenBalance < parseEther('1')}
			{#if any(initialContractsInfos.contracts)['TestTokensDistributor']}
				<div>
					<TxExecutor btn="btn-sm" func={() => topupToken()}>Get Test token</TxExecutor>
				</div>
			{:else}
				<div>
					<span>
						<span><svg class="font-icon"><use xlink:href="#warning" /></svg></span>
						You do not have any token to play
						<a class="underline" href="https://community.etherplay.io" target="_blank" rel="noreferer noopener"
							>Ask on our Discord</a
						>
					</span>
				</div>
			{/if}
			{#if $every3Seconds.synced}
				<span>{timeToText(timeLeftForNextPhase)} left</span>
			{:else}
				<span><svg class="font-icon"><use xlink:href="#warning" /></svg></span>
			{/if}
		{:else if $balance.nativeBalance < MINIMUM_REQUIRED_ETH_BALANCE}
			<div class="warning">
				<span><svg class="font-icon"><use xlink:href="#warning" /></svg></span>
				<!-- {#if isSepolia}
					<a href="https://sepoliafaucet.com/" target="_blank" rel="noopener noreferrer ">Request test ETH</a>
				{:else} -->
				You do not have enough ETH to pay for gas
				<!-- {/if} -->
				<!-- TODO -->
				<!-- {#if testnet}
				<a class="underline" href="https://community.etherplay.io" target="_blank" rel="noreferer noopener"
					>Ask on our Discord</a
				>
				{/if} -->
			</div>
			{#if $every3Seconds.synced}
				<span>{timeToText(timeLeftForNextPhase)} left</span>
			{:else}
				<span><svg class="font-icon"><use xlink:href="#warning" /></svg></span>
			{/if}
		{:else}
			{#if $stratagemsView.hasCommitment}
				<span>Please wait until commit phase is over, or replace your moves</span>
			{:else}
				<span>Please make your move.</span>
			{/if}

			{#if $every3Seconds.synced}
				<span>{timeToText(timeLeftForNextPhase)} left</span>
			{:else}
				<span><svg class="font-icon"><use xlink:href="#warning" /></svg></span>
			{/if}
		{/if}
		{#if isAdmin}
			<div>
				<Executor func={() => nextPhase()}>Skip to Reveal Phase</Executor>
			</div>
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
		{#if $every3Seconds.synced}
			<span>{timeToText(timeLeftForNextPhase)} left</span>
		{:else}
			<span><svg class="font-icon"><use xlink:href="#warning" /></svg></span>
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

	.warning {
		color: orange;
	}
</style>
