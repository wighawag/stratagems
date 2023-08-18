<script lang="ts">
	import Modal from '$lib/components/modals/Modal.svelte';
	import {commitFlow} from '$lib/ui/flows/CommitFlow';

	function cancel(e: MouseEvent) {
		e.preventDefault();
		commitFlow.cancel();
	}

	function confirm(e: MouseEvent) {
		e.preventDefault();
		commitFlow.confirm();
	}
</script>

{#if $commitFlow.state === 'requireConfirmation'}
	<Modal>
		<ul class="steps mb-4 text-xs">
			<li class="step">Confirm</li>
			<li class="step">Send Transaction</li>
			<li class="step">Submit Reveal</li>
			<li class="step">Transaction Confirmed</li>
			<li class="step">Revealed</li>
		</ul>

		<div class="mt-4 modal-action justify-end">
			<button class="btn btn-neutral" on:click={cancel}>Back</button>
			<button class="btn btn-primary" on:click={confirm}>Confirm</button>
		</div>
	</Modal>
{/if}
