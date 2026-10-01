<script lang="ts">
	import {fly} from 'svelte/transition';

	import {serviceWorker} from './serviceWorker';
	import PromptCard from '$utils/ui/prompts/PromptCard.svelte';

	export let src: string;
	export let alt: string;

	function skip() {
		$serviceWorker.updateAvailable = false;
	}

	function reload() {
		if ($serviceWorker.updateAvailable && $serviceWorker.registration) {
			if ($serviceWorker.registration.waiting) {
				$serviceWorker.registration.waiting.postMessage('skipWaiting');
			} else {
				console.error(`not waiting..., todo reload?`);
				// window.location.reload();
			}
			$serviceWorker.updateAvailable = false;
		}
	}
</script>

{#if $serviceWorker.updateAvailable && $serviceWorker.registration}
	<!-- svelte-ignore a11y-click-events-have-key-events-->
	<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		tabindex="0"
		on:click={(e) => {
			console.log(e);
			e.preventDefault();
			e.stopPropagation();
		}}
		class="overlay"
	>
		<div class="card-container" transition:fly={{delay: 250, duration: 300, x: +100}}>
			<PromptCard {src} {alt} on:accept={reload} on:reject={skip}>
				A new version is available. Reload to get the update.
				<span slot="accept">Reload</span>
				<span slot="reject">Skip</span>
			</PromptCard>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		width: 100%;
		height: 100%;
		pointer-events: none;

		display: flex;
		align-items: flex-end;
		justify-content: center;
	}

	@media (min-width: 640px) {
		.overlay {
			align-items: flex-start;
			justify-content: flex-end;
		}
	}

	.card-container {
		margin: 1rem;
		margin-top: 3rem;
	}
</style>
