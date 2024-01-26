<script lang="ts">
	import type {pendingActions as PendingActions} from './';
	export let pendingActions: typeof PendingActions;
	import Modal from '$utils/ui/modals/Modal.svelte';
	import {genericModals, type GenericModalData} from '$utils/ui/modals/generic-modals';

	function confirmPendingTransactionCancellation() {
		// in case the tx is rejected while showing that confirmation modal
		// we need to close it
		const data: GenericModalData = {
			onResponse: (yes: boolean) => {
				unsubscribe();
				if (yes) {
					pendingActions.skip();

					console.log(pendingActions.$state);
				}
				return true;
			},
			type: 'confirm',
			message: 'Are you sure?',
		};
		const unsubscribe = pendingActions.subscribe((p) => {
			if (p.list.length === 0) {
				genericModals.close(data);
			}
		});
		genericModals.open(data);
	}
</script>

{#if $pendingActions.list.length > 0}
	<!-- TODO ? cancelation={{button: true, clickOutside: false}}-->
	<Modal oncancel={confirmPendingTransactionCancellation}>
		{#if $pendingActions.list[0].item.metadata && $pendingActions.list[0].item.metadata.title}
			<h3 class="title">
				{$pendingActions.list[0].item.metadata.title}
			</h3>
		{/if}
		<p class="message">
			{#if $pendingActions.list[0].item.metadata && $pendingActions.list[0].item.metadata.description}
				{$pendingActions.list[0].item.metadata.description}
			{:else}
				'Please confirm or reject the request on your wallet.'
			{/if}
		</p>
	</Modal>
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
