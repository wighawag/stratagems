<script lang="ts">
	import ModalContainer from '$utils/ui/modals/ModalContainer.svelte';
	import type {Cancellation} from '$utils/ui/modals/types';
	import {fly} from 'svelte/transition';

	export let oncancel: Cancellation | undefined = undefined;
	export let onclosed: Cancellation | undefined = undefined;
</script>

<ModalContainer {oncancel} {onclosed}>
	<div class="modal" transition:fly={{y: '50vh'}}>
		<div class="background"></div>
		<div class="wrapper">
			<div class="content">
				<slot />
			</div>
			<div class="actions">
				<slot name="actions" />
			</div>
		</div>
	</div>
</ModalContainer>

<style>
	.modal {
		position: absolute;
		width: 100%;
		height: 100%;
		overflow: auto;
	}
	.background {
		border: 64px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) fill 16 repeat;
		image-rendering: pixelated;
		position: absolute;

		width: 100%;
		height: 100%;
		overflow: auto;
	}
	.wrapper {
		width: 100%;
		position: absolute;
		padding-inline: 32px;
		padding-block: 60px;
		height: 100%;
		width: 100%;

		display: flex;
		flex-direction: column;
	}

	.content {
		overflow: auto;
	}

	img {
		width: 100%;
		max-width: 300px;
		margin-inline: auto;
	}

	.actions {
		padding-top: 2rem;
		margin-top: auto;
	}
</style>
