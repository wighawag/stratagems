<script lang="ts">
	import {connection, contracts} from '$lib/blockchain/connection';
	import Modal from '$utils/ui/modals/Modal.svelte';
	import {toHex} from 'viem';
	import {conversations} from './missiv';
	import {getPublicKey, publicKeyAuthorizationMessage} from 'missiv-client';

	async function registerWithSignature() {
		await contracts.execute(async ({client}) => {
			const user = $conversations.currentUser;
			if (!user) {
				throw new Error(`no user`);
			}
			const publicKey = toHex(getPublicKey(user.delegatePrivateKey));
			const signature = await client.wallet.signMessage({
				message: publicKeyAuthorizationMessage({address: user.address, publicKey}),
			});

			conversations.register(signature);
		});
	}
</script>

<Modal>
	<h3 class="title">One Last Request</h3>
	<p class="message">
		Before we let you explore the world of Stratagems, we ask you to register on the Missiv messaging system so you can
		communicate with other players.
	</p>
	<div class="actions">
		<button on:click={() => registerWithSignature()}>register</button>
	</div>
</Modal>

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
