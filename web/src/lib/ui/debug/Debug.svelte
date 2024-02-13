<script lang="ts">
	import ModalContainer from '$utils/ui/modals/ModalContainer.svelte';
	import {fly} from 'svelte/transition';
	import {debug} from './debug';
	import {accountData} from '$lib/blockchain/connection';
</script>

{#if $debug.open}
	<ModalContainer oncancel={() => ($debug.open = false)}>
		<div class="container" transition:fly={{x: '100%'}}>
			<button
				on:click={() => {
					accountData.resetOffchainProgression();
					location.reload();
				}}>Reset Progression</button
			>
		</div>
	</ModalContainer>
{/if}

<style>
	.container {
		width: 100%;
		top: 2rem;
		pointer-events: auto;
		cursor: default;
		position: absolute;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: start;
		gap: 0.25rem;
		align-items: center;
		right: 0;
		list-style: none;
		padding: 16px;
		border-radius: 16px;

		background-color: var(--color-surface-800);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 fill;
		image-rendering: pixelated;
	}
</style>
