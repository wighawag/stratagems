<script lang="ts">
	import ImgBlockie from '$utils/ethereum/ImgBlockie.svelte';
	import {JsonView} from '@zerodevx/svelte-json-view';
	import type {SharedRatePerAccount} from 'stratagems-indexer';

	export let player: `0x${string}`;
	export let pointsInfo: {
		points: number;
	};
</script>

<div class="container">
	<span class="blockie-wrapper">
		{#if player.toLowerCase() === '0xffffffffffffffffffffffffffffffffffffffff'}
			<img alt="evil faction" src="/game-assets/black.png" />
		{:else}
			<ImgBlockie style="object-fit: cover;height: 100%;width: 100%;" address={player} />
		{/if}
		{pointsInfo.points}
	</span>
	<JsonView json={pointsInfo} depth={1} />
</div>

<style>
	.container {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.blockie-wrapper {
		overflow: hidden;

		aspect-ratio: 1 / 1;
		width: 2rem;
	}
</style>
