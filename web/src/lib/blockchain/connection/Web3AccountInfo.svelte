<script lang="ts">
	import GenericModal from '$utils/ui/modals/GenericModal.svelte';
	import Modal from '$utils/ui/modals/Modal.svelte';
	import type {account as Account} from './';
	import AccountSignIn from './AccountSignIn.svelte';
	export let account: typeof Account;
</script>

{#if $account.unlocking}
	<!-- TODO cancelation={{clickOutside: false, button: true}}-->
	<GenericModal
		oncancel={() => {
			account.cancelUnlock();
			return true;
		}}
		modal={{type: 'info', message: 'Please unlock'}}
	/>
{/if}

{#if $account.loadingStep}
	{#if $account.loadingStep.id == 'SIGNING'}
		<Modal>
			<h3 class="title">Welcome to Stratagems</h3>
			<p class="message">Sign the message to access to your data.</p>
			<div class="modal-action">
				<button on:click={() => account.rejectLoadingStep()} class="error">Cancel</button>
			</div>
		</Modal>
	{:else if $account.loadingStep.id == 'WELCOME'}
		<AccountSignIn {account} />
	{:else}
		<Modal>
			<h3 class="title">{$account.loadingStep.id}</h3>
			<p class="message">{$account.loadingStep.id}</p>
			<div class="modal-action">
				<button on:click={() => account.rejectLoadingStep()} class="error">Cancel</button>
				<button on:click={() => account.acceptLoadingStep()} class="success">Continue</button>
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
