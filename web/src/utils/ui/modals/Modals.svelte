<script lang="ts">
	import {onMount} from 'svelte';
	import {modalStack} from './ModalContainer.svelte';
	import {genericModals} from './generic-modals.js';
	import GenericModal from './GenericModal.svelte';

	let modalsContainer: HTMLDivElement;
	onMount(() => {
		modalStack.addEventListener('added', (event) => {
			modalsContainer.appendChild(event.detail.element);
		});
	});

	function onKeyDown(event: KeyboardEvent): void {
		if (event.code === 'Escape') {
			modalStack.cancel();
		}
	}
</script>

<svelte:window on:keydown={onKeyDown} />

<div class="modals" bind:this={modalsContainer}></div>

{#each $genericModals as modal}
	<GenericModal {modal} />
{/each}

<style>
	.modals {
		position: fixed;
		pointer-events: none;
		width: 100%;
		height: 100%;
	}
</style>
