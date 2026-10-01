<script lang="ts">
	import {contractsInfos} from '$lib/config';
	import {getWalletSwitchChainInfo} from '$lib/blockchain/networks';
	import Modal from '$utils/ui/modals/Modal.svelte';
	import type {connection as Connection, execution as Execution, network as Network, account as Account} from './';
	import GenericModal from '$utils/ui/modals/GenericModal.svelte';

	export let connection: typeof Connection;
	export let account: typeof Account;
	export let execution: typeof Execution;
	export let network: typeof Network;
</script>

{#if $execution.executing}
	{#if $network.notSupported}
		<Modal>
			<h3 class="title">You are connected to unsupported network</h3>
			<p class="message">
				Proceed to switch to {$contractsInfos.chainInfo.name || `the network with chainID: ${$contractsInfos.chainId}`}.
			</p>
			<div class="modal-action">
				<button
					on:click={async () => {
						await execution.cancel();
					}}
					class="error">Cancel</button
				>
				<button
					on:click={() =>
						network.switchTo($contractsInfos.chainId, getWalletSwitchChainInfo($contractsInfos.chainInfo))}
					class="success">Switch</button
				>
			</div>
		</Modal>
	{:else if $account.isLoadingData}
		<GenericModal modal={{type: 'info', message: $account.isLoadingData}} />
		<!-- TODO account need to be connected -->
	{:else if $account.state === 'Disconnected' && !$account.unlocking}
		<Modal>
			<h3 class="title">To proceed, you need to connect to a wallet.</h3>
			<div class="modal-action">
				<button
					on:click={async () => {
						await execution.cancel();
					}}
					class="error">Cancel</button
				>
				<button
					disabled={$connection.connecting}
					class={`${$connection.initialised ? '' : '!invisible'} m-1 button primary`}
					on:click={() => connection.connect()}>{$connection.connecting ? 'Connecting' : 'Connect'}</button
				>
			</div>
		</Modal>
	{/if}
{/if}

<style>
	.title {
		font-size: 1.125rem;
		line-height: 1.75rem;
		font-weight: 700;
	}

	.message {
		padding-top: 1rem;
		padding-bottom: 1rem;
	}
</style>
