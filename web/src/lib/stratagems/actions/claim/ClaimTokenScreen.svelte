<script lang="ts">
	import {initialContractsInfos} from '$lib/config';
	import {account, connection, network} from '$lib/blockchain/connection';
	import ImgBlockie from '../../../utils/ethereum/ImgBlockie.svelte';
	import tokenClaim from './tokenClaim';
	import WelcomeContainer from '$lib/ui/tutorial/WelcomeContainer.svelte';
	import FullScreenModal from '$lib/ui/FullScreenModal.svelte';
	export let name: string;
</script>

{#if $tokenClaim.inUrl}
	<FullScreenModal>
		<h1 class="welcome">
			Welcome to {name}
		</h1>
		<div class="main">
			{#if $tokenClaim.error}
				<p class="error">{$tokenClaim.error}</p>
				<button class="error" on:click={() => tokenClaim.acknowledgeError()}>ok</button>
			{:else if $account.state === 'Connected'}
				<div class="user">
					<ImgBlockie address={$account.address} style="width:64px;height:64px;display: inline-block;" /><span
						>{$account.address}</span
					>
				</div>
				<div class="info">
					{#if $network.notSupported}
						<p class="error">Please switch Your Network.</p>
						<div>
							<button class="primary" on:click={() => network.switchTo(initialContractsInfos.chainId)}>Switch</button>
						</div>
					{:else if $tokenClaim.state === 'Loading'}
						<p class="success">Congratulations! You have been given some tokens to claim.</p>
						<p class="">Loading claim...</p>
					{:else if $tokenClaim.state === 'Available'}
						<p class="success">Congratulations! You have been given some tokens to claim.</p>
						<button class="error" on:click={() => connection.disconnect()}>Disconnect</button>
						<button class="primary" on:click={() => tokenClaim.claim()}>Claim</button>
					{:else if $tokenClaim.state === 'SettingUpClaim'}
						<p>Please wait while the claim is being executed...</p>
						{#if $tokenClaim.txHash}
							<p>
								{#if import.meta.env.VITE_BLOCK_EXPLORER_TRANSACTION}
									<a
										href={`${import.meta.env.VITE_BLOCK_EXPLORER_TRANSACTION}${$tokenClaim.txHash}`}
										target="_blank"
										class="underline">{$tokenClaim.txHash}</a
									>
								{:else}
									transaction : {$tokenClaim.txHash}
								{/if}
							</p>
						{/if}
					{:else if $tokenClaim.state === 'Claiming'}
						<p>Please wait while the claim is being executed...</p>
						{#if $tokenClaim.txHash}
							<p>
								{#if import.meta.env.VITE_BLOCK_EXPLORER_TRANSACTION}
									<a
										href={`${import.meta.env.VITE_BLOCK_EXPLORER_TRANSACTION}${$tokenClaim.txHash}`}
										target="_blank"
										class="underline">{$tokenClaim.txHash}</a
									>
								{:else}
									transaction : {$tokenClaim.txHash}
								{/if}
							</p>
						{/if}
					{:else if $tokenClaim.state === 'Claimed'}
						<p class="success">The tokens are now yours!</p>
						<button class="primary" on:click={() => tokenClaim.clearURL()}>Continue</button>
					{:else if $tokenClaim.state === 'AlreadyClaimedAnother'}
						<p class="error">
							You already claimed tokens at this address. To ensure fairness, you should not be using multiple accounts
							or claim keys.
						</p>
						<button class="primary" on:click={() => tokenClaim.clearURL()}>Continue</button>
					{:else if $tokenClaim.state === 'AlreadyClaimed'}
						<p class="error">The tokens have already been claimed. No more tokens to be given.</p>
						<button class="primary" on:click={() => tokenClaim.clearURL()}>Continue</button>
					{/if}
				</div>
			{:else}
				<p class="success">Congratulations! You have been given some tokens to claim.</p>
				<p>Please connect to your wallet</p>
				<button class="primary" on:click={() => connection.connect()}>Connect</button>
			{/if}
		</div>
	</FullScreenModal>
{/if}

<style>
	.user {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 1rem;
		font-size: 1.5rem;
		flex-wrap: wrap;
		margin-block: 1rem;
	}
	.user span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	p.success {
		padding: 0.5rem;
		margin-block: 0.5rem;
	}

	.info {
		margin-block: 0.5rem;
	}

	p {
		margin-bottom: 0.5rem;
	}
</style>
