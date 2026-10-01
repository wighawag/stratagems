<script lang="ts">
	import ModalContainer from '$utils/ui/modals/ModalContainer.svelte';
	import type {Cancellation} from '$utils/ui/modals/types';
	import {fly} from 'svelte/transition';
	import {XCircle} from 'lucide-svelte';

	export let oncancel: Cancellation = undefined;
	export let onclosed: Cancellation = undefined;
</script>

<ModalContainer {oncancel} {onclosed}>
	<div class="modal" transition:fly={{y: '50vh'}}>
		<div class="background"></div>
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<!-- svelte-ignore a11y-click-events-have-key-events -->

		<div class="wrapper">
			{#if oncancel}
				<div class="close-button" on:click={() => oncancel && oncancel()}>
					<XCircle style="width: 2rem;height:2rem;" />
				</div>
			{/if}
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
		height: 100%;
	}

	.actions {
		padding-top: 2rem;
		margin-top: auto;
	}

	.close-button {
		pointer-events: initial;
		cursor: pointer;
		position: absolute;
		top: 3rem;
		right: 3rem;
	}
</style>
