<script lang="ts">
	import Modal from '$utils/ui/modals/Modal.svelte';
	import {onMount} from 'svelte';
	import type {account as Account} from './';
	export let account: typeof Account;

	let doNotAskAgainSignature: boolean = false;
	let remoteSyncEnabled: boolean = true;

	onMount(() => {
		console.log(`on mount`);
		if (typeof $account.loadingStep?.data?.remoteSyncEnabled !== 'undefined') {
			console.log(
				`loading remoteSyncEnabled: ${$account.loadingStep?.data?.remoteSyncEnabled} from : ${remoteSyncEnabled}`,
			);
			remoteSyncEnabled = $account.loadingStep?.data?.remoteSyncEnabled;
		}
	});
</script>

<Modal>
	<h3 class="title">Welcome to Stratagems</h3>
	<p class="message">
		In order to continue and ensure a safe place to save your data, you'll need to sign a message. Be carefull and only
		sign this message on trusted frontend.
	</p>
	<div class="form-control">
		<label>
			<input type="checkbox" bind:checked={doNotAskAgainSignature} class="checkbox" />
			<span class="label-text">Do not ask again (trust computer)</span>
		</label>
		<label>
			<input type="checkbox" bind:checked={remoteSyncEnabled} class="checkbox" />
			<span class="label-text">Sync across devices (encrypted)</span>
		</label>
	</div>
	<div class="actions">
		<button on:click={() => account.rejectLoadingStep()} class="error">Cancel</button>
		<button on:click={() => account.acceptLoadingStep({doNotAskAgainSignature, remoteSyncEnabled})} class="success"
			>Sign</button
		>
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

	.form-control {
		display: flex;
		align-items: start;
		flex-direction: column;
		margin-bottom: 1rem;
	}

	label {
		cursor: pointer;
	}
</style>
