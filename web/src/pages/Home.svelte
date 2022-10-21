<script lang="ts">
	import WebGLCanvas from '$app/render/WebGLCanvas.svelte';
	import {viewState} from '$app/state/ViewState';
	import CommitConfirmationModal from '$app/ui/modals/CommitConfirmationModal.svelte';
	import ActionPanel from '$app/ui/panels/ActionPanel.svelte';

	let welcome = true;
	function connect(e: MouseEvent) {
		e.preventDefault();
		welcome = false;
	}
</script>

<WebGLCanvas state={viewState} />

<ActionPanel />

<CommitConfirmationModal />

<dialog open={welcome}>
	<article>
		<header>Welcome to "Stratagems"</header>

		<p>You need a Wallet to Play or Watch.</p>
		<footer>
			<a href="#connect" on:click={connect} role="button">Connnect</a>
		</footer>
	</article>
</dialog>
