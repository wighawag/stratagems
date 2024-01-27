<script>
	import localCache from '$utils/localCache';
	import Modal from '$utils/ui/modals/Modal.svelte';

	$: upgraded = localCache.upgraded;
</script>

<!-- TODO tailwind replacement -->

{#if $upgraded}
	<Modal>
		<h3 class="text-lg font-bold">A New Version of Stratagems require A Reset</h3>
		<div class="modal-action">
			<button class="btn btn-success" on:click={() => localCache.acknowledgeNewVersion()}>Reset</button>
		</div>
	</Modal>
{/if}
