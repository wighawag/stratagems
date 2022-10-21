<script lang="ts">
	import {actionState} from '$app/state/ActionState';
	import {commitFlow} from '../flows/CommitFlow';
	function clear(e: MouseEvent) {
		e.preventDefault();
		actionState.clear();
	}

	function commit(e: MouseEvent) {
		e.preventDefault();
		commitFlow.requireConfirmation();
	}
</script>

{#if $actionState.length > 0}
	<article>
		<header>{$actionState.length} moves</header>
		<!-- {#each $actionState as action}
			Body
		{/each} -->
		<footer>
			<a href="#cancel" role="button" class="secondary" data-target="modal-example" on:click={clear}> Cancel </a>
			<a href="#commit" role="button" data-target="modal-example" on:click={commit}> Commit </a>
		</footer>
	</article>
{/if}

<style>
	article {
		position: absolute;
		top: 0;
		right: 0;
	}
</style>
