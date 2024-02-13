<script>
	import Modal from '$utils/ui/modals/Modal.svelte';
</script>

<Modal>
	<div class="wrapper">
		<h3>A new play-test is being worked on</h3>
		<p>
			We recommend you join our <a href="https://community.etherplay.io" rel="noopener noreferer" class="underline"
				>Discord</a
			> if you did not already.
		</p>
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
