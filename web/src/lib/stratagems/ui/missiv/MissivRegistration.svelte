<script lang="ts">
	import {account, connection} from '$lib/blockchain/connection';
	import Modal from '$utils/ui/modals/Modal.svelte';
	import {toHex, type Address} from 'viem';
	import {conversations} from './missiv';
	import {getPublicKey, publicKeyAuthorizationMessage} from 'missiv-client';
	import {createViemWalletClient} from 'web3-connection-viem';
	import {contractsInfos} from '$lib/blockchain/networks';
	import {get} from 'svelte/store';
	import type {ConnectedAccountState, ConnectedState} from 'web3-connection';

	let domainUsername: string = '';

	async function registerWithSignature() {
		// await connection.connect('connection+account');
		const $connection = get(connection);
		const $account = get(account);
		const user = $conversations.currentUser;
		if (!user) {
			throw new Error(`no user`);
		}
		const client = createViemWalletClient({
			chainInfo: get(contractsInfos).chainInfo,
			account: $account as ConnectedAccountState<Address>,
			connection: $connection as ConnectedState,
		});
		const publicKey = toHex(getPublicKey(user.delegatePrivateKey));
		const signature = await client.signMessage({
			message: publicKeyAuthorizationMessage({address: user.address, publicKey}),
		});

		conversations.register(signature, {domainUsername});
	}
</script>

<Modal>
	<h3 class="title">One Last Request</h3>
	<p class="message">
		Before we let you explore the world of Stratagems, we ask you to register on the Missiv messaging system so you can
		communicate with other players.
	</p>

	<label for="missiv-name">Give yourself a name:</label>
	<input name="missiv-name" bind:value={domainUsername} type="text" maxlength="32" />
	<div class="actions">
		<button on:click={() => registerWithSignature()}>register</button>
	</div></Modal
>

<style>
	input {
		background-color: var(--color-surface-700);
		margin-bottom: 1rem;
	}
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
