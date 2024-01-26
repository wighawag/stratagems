<script lang="ts" context="module">
	import type {TypedEventTarget} from '$utils/types/events';

	class BannerStack extends (EventTarget as TypedEventTarget<{
		added: CustomEvent<BannerOnStack>;
		removed: CustomEvent<BannerOnStack>;
	}>) {
		list: BannerOnStack[] = [];
		add(banner: BannerOnStack) {
			this.list.push(banner);
			this.dispatchEvent(new CustomEvent('added', {detail: banner}));
		}
		remove(banner: BannerOnStack) {
			const i = this.list.indexOf(banner);
			if (i >= 0) {
				this.list.splice(i, 1);
			}
			this.dispatchEvent(new CustomEvent('removed', {detail: banner}));
		}

		dismiss() {
			const lastElemIndex = this.list.length - 1;
			if (lastElemIndex >= 0) {
				const banner = this.list[lastElemIndex];
				if (banner.ondismiss) {
					return banner.ondismiss();
				}
			}
		}
	}
	export let bannerStack = new BannerStack();
</script>

<script lang="ts">
	import {onMount} from 'svelte';
	import type {BannerOnStack, Dismiss} from './types.js';

	export let ondismiss: Dismiss;

	let element: HTMLElement;
	let banner: BannerOnStack;
	onMount(() => {
		banner = {element, ondismiss};
		bannerStack.add(banner);
	});

	function onDestroy() {
		bannerStack.remove(banner);
	}
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="banner-container" bind:this={element}>
	<slot />
</div>

<style>
	.banner-container {
		pointer-events: initial;
		display: flex;
		place-content: center;
	}
</style>
