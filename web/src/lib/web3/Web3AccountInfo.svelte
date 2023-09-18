<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import type {account as Account} from './';
	export let account: typeof Account;

	let doNotAskAgainSignature: boolean = false;
</script>

{#if $account.unlocking}
	<Modal
		onResponse={() => {
			account.cancelUnlock();
			return true;
		}}
		settings={{type: 'info', message: 'Please unlock'}}
		cancelation={{clickOutside: false, button: true}}
	/>
{/if}

{#if $account.loadingStep}
	{#if $account.loadingStep == 'SIGNING'}
		<Modal>
			<h3 class="text-lg font-bold">Welcome to Stratagems</h3>
			<p class="py-4">Sign the message to access to your data.</p>
			<div class="modal-action">
				<button on:click={() => account.rejectLoadingStep()} class="btn btn-error">Cancel</button>
			</div>
		</Modal>
	{:else if $account.loadingStep == 'WELCOME'}
		<Modal>
			<h3 class="text-lg font-bold">Welcome to Stratagems</h3>
			<p class="py-4">
				In order to continue and get a safe place to save data, you'll need to sign a message. Be carefull and only sign
				this message on trusted frontend.
			</p>
			<div class="form-control">
				<label class="label cursor-pointer">
					<span class="label-text">Do not ask again (trust computer)</span>
					<input type="checkbox" bind:checked={doNotAskAgainSignature} class="checkbox" />
				</label>
			</div>
			<div class="modal-action">
				<button on:click={() => account.rejectLoadingStep()} class="btn btn-error">Cancel</button>
				<button on:click={() => account.acceptLoadingStep(doNotAskAgainSignature)} class="btn">Sign</button>
			</div>
		</Modal>
	{:else}
		<Modal>
			<h3 class="text-lg font-bold">{$account.loadingStep}</h3>
			<p class="py-4">{$account.loadingStep}</p>
			<div class="modal-action">
				<button on:click={() => account.rejectLoadingStep()} class="btn btn-error">Cancel</button>
				<button on:click={() => account.acceptLoadingStep()} class="btn">Continue</button>
			</div>
		</Modal>
	{/if}
{/if}
