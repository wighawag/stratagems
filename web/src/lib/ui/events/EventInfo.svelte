<script lang="ts">
	import ImgBlockie from '$utils/ethereum/ImgBlockie.svelte';
	import {url} from '$utils/path';
	import type {CellPlacements} from 'stratagems-indexer';

	export let event: CellPlacements;
</script>

<div class="container">
	{#if event.players.length > 1}
		<img src={url('/game-assets/black.png')} alt="black game" />
		{#each event.players as player}
			<span class="blockie-wrapper">
				<ImgBlockie style="object-fit: cover;height: 100%;width: 100%;" address={player.address} />
			</span>
		{/each}
	{:else}
		{@const player = event.players[0]}

		<span class="blockie-wrapper">
			<ImgBlockie style="object-fit: cover;height: 100%;width: 100%;" address={player.address} />
		</span>
	{/if}
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
