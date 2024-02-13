<script lang="ts">
	import {switchToSupportedNetwork, type connection as Connection, type network as Network, account} from './';
	export let network: typeof Network;
	export let connection: typeof Connection;
	import {contractNetwork} from '$lib/blockchain/networks';
	import {url} from '$utils/path';
	import {resetIndexer} from '$lib/state/State';
	import NeedAWallet from './NeedAWallet.svelte';
	import GenericBanner from '$utils/ui/banners/GenericBanner.svelte';
	import Banner from '$utils/ui/banners/Banner.svelte';

	const builtin = connection.builtin;

	$: console.log($connection.error);

	function aknowledgeErrorAndConnect() {
		connection.acknowledgeError();
		connection.connect();
	}

	function aknowledgeErrorAndSwitchNetwork() {
		connection.acknowledgeError();
		switchToSupportedNetwork();
	}
</script>

{#if $connection.error}
	{#if $connection.error.id === 'NoBuiltinWallet'}
		<NeedAWallet />
	{:else}
		<!-- -->
		{#if $account.state !== 'Connected'}
			<GenericBanner
				banner={{
					title: 'Not Connected',
					message: $connection.error.message,
					button: `Connect`,
					ondismiss: aknowledgeErrorAndConnect,
				}}
			/>
		{:else if $network.notSupported}
			<GenericBanner
				banner={{
					title: 'Network not supported',
					message: $connection.error.message,
					button: `switch to ${$contractNetwork.name}`,
					ondismiss: aknowledgeErrorAndSwitchNetwork,
				}}
			/>
		{:else}
			<GenericBanner
				banner={{
					title: $connection.error.title,
					message: $connection.error.message,
					ondismiss: connection.acknowledgeError,
				}}
			/>
		{/if}
	{/if}
{:else if $network.nonceCached === 'BlockOutOfRangeError' || $network.genesisNotMatching || $network.blocksCached}
	<Banner>
		<p class="main-message">
			{$builtin.vendor === 'Metamask' ? 'Block cache detected, Metamask  😭' : 'Block cache detected'}
		</p>

		<p class="message">You'll need to shutdown and reopen your browser</p>
		<button tabindex="0" on:click={() => location.reload()}> Else Try Reload? </button>
	</Banner>
{:else if $network.hasEncounteredBlocksCacheIssue}
	<Banner>
		<p class="main-message">You seemed to have recovered from Block Cacke Issue</p>

		<p class="message">You most likely need to clear any data dervided from the chain as it may be invalid.</p>
		<button tabindex="0" on:click={() => resetIndexer().then(() => network.acknowledgeBlockCacheIssue())}>
			Clear
		</button>
	</Banner>
{:else if $network.nonceCached === 'cache'}
	<Banner>
		<p class="main-message">
			{$builtin.vendor === 'Metamask'
				? 'Nonce cache detected, Metamask need to have its accounts reset 😭'
				: 'Nonce cache detected. Please clear your account data.'}
		</p>
		{#if $builtin.vendor === 'Metamask'}
			<p class="message">
				Click on the Metamask extension icon:
				<img class="icon" src={url('/images/wallets/metamask.svg')} alt="Metamask extension" />
				then open the menu
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="font-icon"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
					/>
				</svg> &gt; Settings &gt; Advanced &gt; Clear Activity Tab Data
			</p>
		{/if}
	</Banner>
{/if}

<style>
	.main-message {
		margin: 0.5rem;
	}

	.message {
		margin: 0.5rem;
		font-weight: 900;
	}

	.icon {
		display: inline;
		margin-left: 0.5rem;
		margin-right: 0.5rem;
		width: 1.5rem;
		height: 1.5rem;
		vertical-align: bottom;
	}

	.font-icon {
		display: inline;
		width: 1.5rem;
		height: 1.5rem;
		vertical-align: bottom;
	}
</style>
