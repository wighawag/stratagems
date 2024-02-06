<script lang="ts">
	import {fade} from 'svelte/transition';
	import {splash} from './splash';
	import {browser} from '$app/environment';
	import {onMount} from 'svelte';

	onMount(() => {
		splash.start();
	});
</script>

{#if $splash && $splash.stage === 1}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="overlay stratagems" out:fade on:click={() => splash.nextStage()}>
		<div class="content">
			<img src="./title.png" alt="Stratagems title" on:load={() => splash.gameLogoReady()} />
			<p class="description">World Building</p>
		</div>
	</div>
{/if}

{#if $splash && $splash.stage === 0}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div class="overlay etherplay" out:fade on:click={() => splash.nextStage()}>
		<div class="content">
			{#if browser}
				<img src="./logo_with_text_on_black.png" alt="Etherplay Logo" on:load={() => splash.etherplayLogoReady()} />
				<!-- <p class="description">presents</p> -->
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		overflow-y: auto;
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 50;
		background-color: #000000;

		height: 100%;
	}

	.overlay.stratagems {
		background-color: var(--color-surface-500);
	}

	.stratagems .content {
		margin-top: 8rem;
		text-align: center;
		justify-content: center;
	}

	.stratagems img {
		margin-left: auto;
		margin-right: auto;
		margin-bottom: 2rem;
		max-width: 28rem;

		width: 80%;
	}

	.stratagems .description {
		margin: 1.5rem;
		margin-top: 5rem;
		color: #6b7280;
		font-size: 1.5rem;
		line-height: 2rem;
		font-weight: 900;
	}

	.etherplay .content {
		display: flex;
		text-align: center;
		justify-content: center;
		align-items: center;
		height: 100%;
	}

	.etherplay img {
		margin-left: auto;
		margin-right: auto;
		margin-bottom: 2rem;
		max-width: 20rem;
		width: 80%;
	}

	/* .etherplay .description {
		margin: 1.5rem;
		color: #9ca3af;
		font-size: 2.25rem;
		line-height: 2.5rem;
		font-weight: 900;
	} */
</style>
