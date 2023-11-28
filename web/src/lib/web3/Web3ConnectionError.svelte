<script lang="ts">
	import type {connection as Connection, network as Network} from './';
	export let network: typeof Network;
	export let connection: typeof Connection;
	import AlertWithSlot from '$lib/components/alert/AlertWithSlot.svelte';
	import Alert from '$lib/components/alert/Alert.svelte';
	import Modal from '$lib/components/modals/Modal.svelte';
	import MetaMaskOnboarding from '@metamask/onboarding';
	import {url} from '$lib/utils/path';
	import {contractsInfos} from '$lib/config';
	import {getNetworkConfig} from '$lib/blockchain/networks';
	import {resetIndexer} from '$lib/blockchain/state/State';

	const builtin = connection.builtin;

	let onboarding: MetaMaskOnboarding | undefined;
	let interval: any | undefined;
	function onboard() {
		if (!onboarding) {
			onboarding = new MetaMaskOnboarding();
			onboarding.startOnboarding();
			// TODO better ? handle it in web3-connection
			// including onboarding improvement
			localStorage.setItem('_web3w_previous_wallet_type', 'builtin');
			async function check() {
				if (MetaMaskOnboarding.isMetaMaskInstalled()) {
					if (interval) {
						clearInterval(interval);
						interval = undefined;
					}
					if (onboarding) {
						onboarding.stopOnboarding();
						onboarding = undefined;
					}
					connection.select('builtin');
				}
			}
			interval = setInterval(check, 1000);
		}
	}

	function cancelOnboarding() {
		if (interval) {
			clearInterval(interval);
			interval = undefined;
		}
		if (onboarding) {
			onboarding.stopOnboarding();
			onboarding = undefined;
		}
		connection.acknowledgeError();
	}
</script>

{#if onboarding}
	<Modal>
		<h3 class="font-bold text-lg">Installing Metamask...</h3>
		<p class="py-4">Please Follow The Instructions</p>
		<div class="modal-action justify-end">
			<form method="dialog">
				<!-- <button class="btn btn-primary" on:click={() => connection.select('builtin')}>I am done</button> -->
				<button class="btn" on:click={() => cancelOnboarding()}>Cancel</button>
			</form>
		</div>
	</Modal>
{:else if $connection.error}
	{#if $connection.error.id === 'NoBuiltinWallet'}
		<Modal>
			<h3 class="font-bold text-lg">No Web3 Wallet Found</h3>
			<p class="py-4">Please Install A Wallet like Metamask</p>
			<div class="modal-action justify-end">
				<form method="dialog">
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<img
						class="h-12 inline-block"
						src={url('/images/wallets/metamask-install.svg')}
						alt="Metamask"
						on:click={() => onboard()}
					/>
					<!-- if there is a button in form, it will close the modal -->
					<button class="btn" on:click={() => connection.acknowledgeError()}>Cancel</button>
				</form>
			</div>
			<!-- <h2>We could not detect any web3 wallet. Please install a wallet like Metamask</h2>
			<div class="mt-4 modal-action justify-end">
				<button class="btn btn-primary" on:click={() => onboard()}>OK</button>
			</div> -->
		</Modal>
	{:else}
		<!-- TODO remove or retest-->
		<!-- {#if $connection.error?.code == 7221}
		<AlertWithSlot onClose={connection.acknowledgeError}>
			{#if $builtin.vendor === 'Metamask'}
				<p>
					Metamask is not responding. See <a
						class="link"
						href="https://github.com/MetaMask/metamask-extension/issues/7221"
						target="_blank"
						rel="noreferrer">github issue</a
					>. Please
					<a class="link" on:click={() => location.reload()} href=".">reload</a>
				</p>
			{:else}
				<p>
					Your Wallet is not responding. Please <a class="link" on:click={() => location.reload()} href=".">reload.</a>
				</p>
			{/if}
		</AlertWithSlot>
	{:else} -->
		<Alert data={$connection.error} onClose={connection.acknowledgeError} />
		<!-- {/if} -->
	{/if}
{:else if $network.notSupported}
	<Modal>
		<h3 class="font-bold text-lg">Wrong Network</h3>
		<p class="py-4">Your Wallet is connected to the wrong network.</p>
		<div class="modal-action justify-end">
			<form method="dialog">
				<button
					class="btn"
					on:click={() => network.switchTo($contractsInfos.chainId, getNetworkConfig($contractsInfos.chainId))}
					>Switch</button
				>
			</form>
		</div>
		<!-- <h2>We could not detect any web3 wallet. Please install a wallet like Metamask</h2>
	<div class="mt-4 modal-action justify-end">
		<button class="btn btn-primary" on:click={() => onboard()}>OK</button>
	</div> -->
	</Modal>
{:else if $network.nonceCached === 'BlockOutOfRangeError' || $network.genesisNotMatching || $network.blocksCached}
	<AlertWithSlot>
		<p class="m-2">
			{$builtin.vendor === 'Metamask' ? 'Block cache detected, Metamask  😭' : 'Block cache detected'}
		</p>

		<p class="m-2 font-black">You'll need to shutdown and reopen your browser</p>
		<button class="btn block mt-3" tabindex="0" on:click={() => location.reload()}> Else Try Reload? </button>
	</AlertWithSlot>
{:else if $network.hasEncounteredBlocksCacheIssue}
	<AlertWithSlot>
		<p class="m-2">You seemed to have recovered from Block Cacke Issue</p>

		<p class="m-2 font-black">You most likely need to clear any data dervided from the chain as it may be invalid.</p>
		<button
			class="btn block mt-3"
			tabindex="0"
			on:click={() => resetIndexer().then(() => network.acknowledgeBlockCacheIssue())}
		>
			Clear
		</button>
	</AlertWithSlot>
{:else if $network.nonceCached === 'cache'}
	<AlertWithSlot>
		<p class="m-2">
			{$builtin.vendor === 'Metamask'
				? 'Nonce cache detected, Metamask need to have its accounts reset 😭'
				: 'Nonce cache detected. Please clear your account data.'}
		</p>
		{#if $builtin.vendor === 'Metamask'}
			<p class="m-2 font-black">
				Click on the Metamask extension icon:
				<img class="inline w-6 h-6 mx-2" src={url('/images/wallets/metamask.svg')} alt="Metamask extension" />
				then open the menu
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="w-6 h-6 inline"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
					/>
				</svg> &gt; Settings &gt; Advanced &gt; Clear Activity Tab Data
			</p>
		{/if}
	</AlertWithSlot>
{/if}
