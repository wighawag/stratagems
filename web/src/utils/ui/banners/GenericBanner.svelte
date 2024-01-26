<script lang="ts">
	import Banner from './Banner.svelte';
	import { type GenericBannerData } from './generic-banners.js';

	export let banner: GenericBannerData;
</script>

<Banner style="--width:300px;--height:200px;--background-color:purple;">
	{#if banner.title}
		{banner.title}
	{/if}
	{banner.message}
</Banner>
