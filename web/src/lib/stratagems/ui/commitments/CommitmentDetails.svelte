<script lang="ts">
	import {commitmentDetailsView} from './commitmentsView';
	import {JsonView} from '@zerodevx/svelte-json-view';
	import ModalContainer from '$utils/ui/modals/ModalContainer.svelte';
	import {fly} from 'svelte/transition';
</script>

{#if $commitmentDetailsView.commitment}
	<ModalContainer oncancel={() => ($commitmentDetailsView.commitment = undefined)}>
		<div class="container" transition:fly={{y: '100%'}}>
			<JsonView json={$commitmentDetailsView.commitment} depth={0} />
		</div>
	</ModalContainer>
{/if}

<style>
	.container {
		top: 2rem;
		right: 0;
		width: 100%;
		height: calc(100% - 2rem);
		overflow-y: auto;

		pointer-events: auto;
		cursor: default;
		position: absolute;

		display: flex;
		flex-direction: column;
		justify-content: start;
		gap: 0.25rem;

		list-style: none;
		padding: 16px;
		border-radius: 16px;

		background-color: var(--color-surface-800);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 fill;
		image-rendering: pixelated;
	}
</style>
