<script>
	import Modal from '../modals/Modal.svelte';
</script>

<Modal cancelation={{cancelable: false}}>
	<h3 class="text-lg font-bold">A new play-test is being worked on</h3>
	<p class="py-4">Please come back later!</p>
	<p class="py-4">
		If you did not register for the play test you can do so <a
			href="https://backdropbeta.com/stratagems"
			target="_blank"
			rel="noopener noreferer"
			class="underline">here</a
		>
	</p>
	<p class="py-4">
		And we recommend you join our <a
			href="https://community.etherplay.io"
			target="_blank"
			rel="noopener noreferer"
			class="underline">Discord</a
		> if you did not already
	</p>
	<div class="modal-action">
		<a href="https://community.etherplay.io" target="_blank" rel="noopener noreferer" class="btn btn-info bg-purple-600"
			>Discord</a
		>
		<a href="https://backdropbeta.com/stratagems" target="_blank" rel="noopener noreferer" class="btn btn-success"
			>Playtest</a
		>
	</div>
</Modal>
