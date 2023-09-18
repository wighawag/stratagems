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
{:else if $network.genesisNotMatching}
	<AlertWithSlot>
		<p class="m-2">Chain reset detected! Metamask need to have its account reset!</p>
		<p class="m-2 font-black">
			Click on your account icon, Go to Settings -&gt; Advanced -&gt; Clear Activity Tab Data
		</p>
		<!-- <button
			class="btn btn-sm"
			on:click={async () => {
				await network.notifyThatCacheHasBeenCleared();
				accountData._reset();
				location.reload();
			}}>I have done it</button
		> -->
	</AlertWithSlot>
{:else if $network.nonceCached === 'BlockOutOfRangeError'}
	<AlertWithSlot>
		<p class="m-2">Block cache detected, Metamask need to have its account reset!</p>
		<p class="m-2 font-black">
			Click on your account icon, Go to Settings -&gt; Advanced -&gt; Clear Activity Tab Data
		</p>
	</AlertWithSlot>
{:else if $network.nonceCached === 'cache'}
	<AlertWithSlot>
		<p class="m-2">Nonce cache detected, Metamask need to have its account reset!</p>
		<p class="m-2 font-black">
			Click on your account icon, Go to Settings -&gt; Advanced -&gt; Clear Activity Tab Data
		</p>
	</AlertWithSlot>
{:else if $network.genesisChanged}
	<div
		style="width: auto; left: 0px; right: 0px; max-width: 100%;"
		class="m-2 fixed z-50 top-0 alert alert-warning shadow-lg"
	>
		<div>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="stroke-current flex-shrink-0 h-6 w-6"
				fill="none"
				viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/></svg
			>
			<span>Warning: Network Reset</span>
		</div>

		<!-- svelte-ignore a11y-click-events-have-key-events-->
		<span
			role="button"
			tabindex="0"
			class="absolute top-0 bottom-0 right-0 px-4 py-3"
			on:click={() => network.acknowledgeNewGenesis()}
		>
			<svg class="fill-current h-6 w-6" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"
				><title>Close</title><path
					d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"
				/></svg
			>
		</span>
	</div>
{/if}
