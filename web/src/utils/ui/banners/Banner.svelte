<script lang="ts">
	import {fly} from 'svelte/transition';
	import BannerContainer from './BannerContainer.svelte';
	import {type Dismiss} from './types.js';

	export let ondismiss: Dismiss = undefined;
	export let style: string | undefined = undefined;
</script>

<BannerContainer {ondismiss}>
	<div class="banner" transition:fly={{y: '-100%'}} {style}>
		<slot />
	</div>
</BannerContainer>

<style>
	.banner {
		background-color: var(--color-surface-800, var(--background-color, red));
		box-shadow:
			0 10px 15px -3px rgba(0, 0, 0, 0.1),
			0 4px 6px -2px rgba(0, 0, 0, 0.05);
		padding: 1rem;

		top: 0;
		position: fixed;

		width: 100%;
		max-width: 600px;
	}
</style>
