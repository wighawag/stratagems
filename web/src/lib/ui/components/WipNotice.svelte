<script lang="ts">
	import {initialContractsInfos} from '$lib/config';
	import Modal from '$utils/ui/modals/Modal.svelte';
	$: date = (initialContractsInfos as any).name == 'base' ? 'Thursday 21st March' : undefined;
</script>

<Modal>
	<div class="wrapper">
		{#if date}
			<h3>Come back on {date}</h3>
		{:else}
			<h3>A new play-test is being worked on</h3>
		{/if}

		<div class="modal-actions">
			<a role="button" href="https://community.etherplay.io" rel="noopener noreferer">Join Our Community</a>
		</div>
	</div>
</Modal>

<style>
	.wrapper {
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		text-align: center;
	}
	.modal-actions {
		display: flex;
		justify-content: center;
	}
</style>
