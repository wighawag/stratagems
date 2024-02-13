<script lang="ts">
	import {fly} from 'svelte/transition';
	import BannerContainer from './BannerContainer.svelte';

	export let style: string | undefined = undefined;
</script>

<BannerContainer>
	<div class="banner" transition:fly={{y: '-100%'}} {style}>
		<slot />
	</div>
</BannerContainer>

<style>
	.banner {
		background-color: var(--color-surface-800);
		border: 32px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border-red.png) 16 fill;

		image-rendering: pixelated;
		box-shadow:
			0 10px 15px -3px rgba(0, 0, 0, 0.1),
			0 4px 6px -2px rgba(0, 0, 0, 0.05);
		padding: 1rem;

		top: 0;
		position: fixed;

		width: 100%;
		max-width: 600px;
		word-wrap: break-word;
	}
</style>
