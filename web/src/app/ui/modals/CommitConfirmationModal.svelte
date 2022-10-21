<script lang="ts">
	import {commitFlow} from '$app/ui/flows/CommitFlow';

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
	<dialog open>
		<article>
			<header>Commit Your Moves</header>
			<p>They are hidden to other players.</p>
			<p>Come back tomorrow to reveal them.</p>
			<footer>
				<a href="#cancel" role="button" class="secondary" data-target="modal-example" on:click={cancel}> Cancel </a>
				<a href="#confirm" role="button" data-target="modal-example" on:click={confirm}> Confirm </a>
			</footer>
		</article>
	</dialog>
{/if}
