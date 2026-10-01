<script lang="ts">
	import Modal from '$utils/ui/modals/Modal.svelte';
	import {info} from './info';
	import {timeToText} from '$utils/time';
</script>

{#if $info.panel?.type === 'RevealPhase'}
	<Modal oncancel={() => info.close()}>
		<div class="title">Reveal Phase</div>
		<div class="description">
			<p>The Game is currently in "reveal" phase</p>
			<p>During this phase, player will reveal their move.</p>
			<p>In most cases this is done autonomatically. If not, you ll be reminded to reveal</p>
			<p>The Reveal Phase ends in {timeToText($info.panel.timeLeftToReveal)}</p>
		</div>
		<div class="actions">
			<button on:click={() => info.close()}>OK</button>
		</div>
	</Modal>
{:else if $info.panel?.type === 'MaxMovesReached'}
	<Modal oncancel={() => info.close()}>
		<div class="title">Max Number of Moves Reached</div>
		<div class="description">
			<p>In the current version of the frontend, the max number of moves is limited to 30 moves</p>
		</div>
		<div class="actions">
			<button on:click={() => info.close()}>OK</button>
		</div>
	</Modal>
{/if}

<style>
	.title {
		font-weight: bold;
		font-size: clamp(1rem, 4vw, 1.25rem);
		margin-bottom: 2rem;
		text-align: center;
	}

	.description {
		text-align: center;
		margin-bottom: 1rem;
	}

	.description p {
		margin-bottom: 0.4rem;
	}

	.actions {
		text-align: center;
	}
</style>
