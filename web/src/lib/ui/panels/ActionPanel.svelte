<script lang="ts">
	import {actionState} from '$lib/action/ActionState';
	import {commitFlow} from '$lib/ui/flows/CommitFlow';
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
	<div class="pointer-events-none select-none fixed top-0 h-full grid place-items-end w-full max-w-full">
		<div class="flex flex-row-reverse m-2">
			<div class="card w-96 bg-base-content glass">
				<div class="card-body">
					<h2 class="card-title text-primary">Your Move:</h2>
					<p class="text-secondary">You'll stake {$actionState.length} cells</p>
					<div class="mt-4 card-actions justify-end">
						<button class="pointer-events-auto btn btn-neutral" on:click={clear}>Clear</button>
						<button class="pointer-events-auto btn btn-primary" on:click={commit}>Commit</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
