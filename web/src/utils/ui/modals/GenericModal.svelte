<script lang="ts">
	import Modal from './Modal.svelte';
	import {genericModals, type GenericModalData} from './generic-modals.js';
	import type {Cancellation} from './types';

	export let oncancel: Cancellation | undefined = undefined;
	export let modal: GenericModalData;
	$: info = modal.type === 'info' ? modal : undefined;
	$: confirm = modal.type === 'confirm' ? modal : undefined;
</script>

<Modal {oncancel} style="--width:300px;--height:300px;--background-color:purple;">
	{#if confirm}
		{@const m = confirm}
		{#if m.title}
			<p>{confirm.title}</p>
		{/if}
		<p>{confirm.message}</p>
		<button
			on:click={() => {
				genericModals.close(modal);
				m.onResponse(false);
			}}>cancel</button
		>
		<button
			on:click={() => {
				genericModals.close(modal);
				m.onResponse(true);
			}}>confirm</button
		>
	{:else if info}
		{#if info.title}
			<p>{info.title}</p>
		{/if}
		<p>{info.message}</p>
	{:else}
		Unknown modal type: {modal.type}
	{/if}
</Modal>
