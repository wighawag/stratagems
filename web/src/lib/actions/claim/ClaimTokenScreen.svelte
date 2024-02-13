<script lang="ts">
	import {initialContractsInfos} from '$lib/config';
	import {account, connection, network} from '$lib/blockchain/connection';
	import ImgBlockie from '../../../utils/ethereum/ImgBlockie.svelte';
	import tokenClaim from './tokenClaim';
	export let name: string;
</script>

<!-- TODO tailwind replacement -->

{#if $tokenClaim.inUrl}
	<div class="tokenClaim">
		<div class="welcome">
			Welcome to {name}
		</div>
		<div class="main">
			{#if $tokenClaim.error}
				<p class="m-5 text-error">{$tokenClaim.error}</p>
				<button class="btn btn-warning" on:click={() => tokenClaim.acknowledgeError()}>ok</button>
			{:else if $account.state === 'Connected'}
				<p>Hello</p>
				<!-- class="inline-block w-12 h-12" -->
				<p><ImgBlockie address={$account.address} /></p>
				<p>{$account.address}</p>
				{#if $network.notSupported}
					<p class="m-5 text-error">Please switch Your Network.</p>
					<div>
						<button class="btn btn-primary" on:click={() => network.switchTo(initialContractsInfos.chainId)}
							>Switch</button
						>
					</div>
				{:else if $tokenClaim.state === 'Loading'}
					<p class="text-success">Congratulations! You have been given some tokens to claim.</p>
					<p class="mt-5">Loading claim...</p>
				{:else if $tokenClaim.state === 'Available'}
					<p class="text-success">Congratulations! You have been given some tokens to claim.</p>
					<button class="btn btn-primary" on:click={() => tokenClaim.claim()}>Claim</button>
				{:else if $tokenClaim.state === 'SettingUpClaim'}
					<p class="mt-5">Please wait while the claim is being executed...</p>
					{#if $tokenClaim.txHash}
						<p>
							{#if import.meta.env.VITE_BLOCK_EXPLORER_TRANSACTION}
								<a
									href={`${import.meta.env.VITE_BLOCK_EXPLORER_TRANSACTION}${$tokenClaim.txHash}`}
									target="_blank"
									class="text-warning hover:text-error underline">{$tokenClaim.txHash}</a
								>
							{:else}
								transaction : {$tokenClaim.txHash}
							{/if}
						</p>
					{/if}
				{:else if $tokenClaim.state === 'Claiming'}
					<p class="mt-5">Please wait while the claim is being executed...</p>
					{#if $tokenClaim.txHash}
						<p>
							{#if import.meta.env.VITE_BLOCK_EXPLORER_TRANSACTION}
								<a
									href={`${import.meta.env.VITE_BLOCK_EXPLORER_TRANSACTION}${$tokenClaim.txHash}`}
									target="_blank"
									class="text-warning hover:text-error underline">{$tokenClaim.txHash}</a
								>
							{:else}
								transaction : {$tokenClaim.txHash}
							{/if}
						</p>
					{/if}
				{:else if $tokenClaim.state === 'Claimed'}
					<p class="m-5 text-success">The tokens are now yours!</p>
					<button class="btn btn-primary" on:click={() => tokenClaim.clearURL()}>Continue</button>
				{:else if $tokenClaim.state === 'AlreadyClaimedAnother'}
					<p class="m-5 text-error">
						You already claimed tokens at this address. To ensure fairness, you should not be using multiple accounts or
						claim keys.
					</p>
					<button class="btn btn-primary" on:click={() => tokenClaim.clearURL()}>Continue</button>
				{:else if $tokenClaim.state === 'AlreadyClaimed'}
					<p class="m-5 text-error">The tokens have already been claimed. No more tokens to be given.</p>
					<button class="btn btn-primary" on:click={() => tokenClaim.clearURL()}>Continue</button>
				{/if}
			{:else}
				<p class="text-success">Congratulations! You have been given some tokens to claim.</p>
				<p class="m-5">Please connect to your wallet</p>
				<button class="btn btn-primary" on:click={() => connection.connect()}>Connect</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.tokenClaim {
		pointer-events: auto;
		width: 100%;
		height: 100%;
		background-color: black;
	}
</style>
