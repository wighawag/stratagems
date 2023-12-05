<script>
	import localCache from '$lib/utils/localCache';
	import Modal from '../modals/Modal.svelte';

	$: upgraded = localCache.upgraded;
</script>

{#if $upgraded}
	<Modal cancelation={{cancelable: false}}>
		<h3 class="text-lg font-bold">A New Version of Stratagems require A Reset</h3>
		<div class="modal-action">
			<button class="btn btn-success" on:click={() => localCache.acknowledgeNewVersion()}>Reset</button>
		</div>
	</Modal>
{/if}
