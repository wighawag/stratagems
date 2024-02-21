<script lang="ts">
	import {onMount} from 'svelte';
	import {bannerStack} from './BannerContainer.svelte';
	import {genericBanners} from './generic-banners.js';
	import GenericBanner from './GenericBanner.svelte';

	let bannersContainer: HTMLDivElement;
	onMount(() => {
		bannerStack.addEventListener('added', (event) => {
			bannersContainer.appendChild(event.detail.element);
		});
	});
</script>

<div class="banners" bind:this={bannersContainer}></div>

{#each $genericBanners as banner}
	<GenericBanner {banner} />
{/each}

<style>
	.banners {
		position: fixed;
		pointer-events: none;
		width: 100%;
	}
</style>
