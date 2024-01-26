<script lang="ts">
	import {createEventDispatcher} from 'svelte';

	export let src: string;
	export let alt: string;

	const dispatch = createEventDispatcher();
</script>

<div class="card">
	<div class="image-container">
		<img class="logo" {src} {alt} />
	</div>
	<div class="content">
		<div class="text"><slot /></div>
		<div class="buttons-container">
			<button on:click={() => dispatch('reject')} type="button" class="error"
				><slot name="reject">Reject</slot>
			</button>
			<button on:click={() => dispatch('accept')} type="button" class="success"
				><slot name="accept">Accept</slot></button
			>
		</div>
	</div>
	<button on:click={() => dispatch('reject')} class="button-close">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="font-icon lucide lucide-x"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
		>
	</button>
</div>

<style lang="css">
	.card {
		max-width: 24rem;
		width: 100%;
		box-shadow:
			0 10px 15px -3px rgba(0, 0, 0, 0.1),
			0 4px 6px -2px rgba(0, 0, 0, 0.05);
		border-radius: 0.5rem;
		pointer-events: auto;
		background-color: var(--color-surface-800, var(--background-color));
		color: var(--color);

		display: flex;
		align-items: flex-start;

		padding: 1rem;
	}

	.image-container {
		padding-top: 0.125rem;
		flex-shrink: 0;
	}

	.logo {
		width: 4rem;
		height: 4rem;
		border-width: 2px;
		border-radius: 1rem;
		border-color: var(--color-surface-700);
	}

	.content {
		margin-inline: 0.75rem;
		flex: 1 1 0%;
	}

	.text {
		color: var(--color-text-on-surface);
		font-size: 1rem;
		line-height: 1.5rem;
		font-weight: 500;
	}

	.buttons-container {
		display: flex;
		margin-top: 1rem;
		gap: 1rem;
		justify-content: end;
	}

	.button-close {
		color: var(--color-text-on-surface);
		background-color: var(--color-surface-500);
	}

	.font-icon {
		min-width: 1.2em;
		width: 1.2em;
		height: 1.2em;
	}
</style>
