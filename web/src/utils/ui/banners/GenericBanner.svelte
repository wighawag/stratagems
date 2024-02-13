<script lang="ts">
	import Banner from './Banner.svelte';
	import {type GenericBannerData} from './generic-banners.js';

	export let banner: GenericBannerData;

	function dismiss() {
		banner.ondismiss && banner.ondismiss();
	}
</script>

<Banner>
	<div class="title">
		<h1>
			{#if banner.title}
				{banner.title}
			{/if}
		</h1>
	</div>
	<div class="content">
		{banner.message}

		{#if banner.ondismiss}
			<button on:click={() => dismiss()}>{banner.button || 'OK'}</button>
		{/if}
	</div>
</Banner>

<style>
	.title h1 {
		font-size: medium;
		font-weight: bold;
		margin-bottom: 1rem;
	}
	.content {
		display: flex;
		flex-direction: row;
		justify-content: space-between;
	}

	button {
		height: fit-content;
		padding: 0.25rem;
	}
</style>
