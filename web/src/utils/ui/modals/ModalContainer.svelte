<script lang="ts" context="module">
	import type {TypedEventTarget} from '$utils/types/events';

	class ModalStack extends (EventTarget as TypedEventTarget<{
		added: CustomEvent<ModalOnStack>;
		removed: CustomEvent<ModalOnStack>;
	}>) {
		list: ModalOnStack[] = [];
		currentTrap: FocusTrap | undefined;
		present: number = 0;
		add(modal: ModalOnStack) {
			this.present++;
			console.log({add: this.present});
			this.list.push(modal);
			this.dispatchEvent(new CustomEvent('added', {detail: modal}));
		}
		remove(modal: ModalOnStack, skipPresentRemoval = false) {
			const i = this.list.indexOf(modal);
			if (i >= 0) {
				this.list.splice(i, 1);
				if (!skipPresentRemoval) {
					this.present--;
					console.log({remove: this.present});
				} else {
					modal.outroTimeout = setTimeout(this.onOutroEnd.bind(this, modal), 500);
				}
				this.dispatchEvent(new CustomEvent('removed', {detail: modal}));
			}
		}

		onOutroEnd(modal: ModalOnStack) {
			if (modal.outroTimeout) {
				clearTimeout(modal.outroTimeout);
				modal.outroTimeout = undefined;
				this.present--;
				console.log({onOutroEnd: this.present});
			}
		}

		cancel() {
			const lastElemIndex = this.list.length - 1;
			if (lastElemIndex >= 0) {
				const modal = this.list[lastElemIndex];
				if (modal.oncancel) {
					return modal.oncancel();
				}
			}
		}
	}
	export let modalStack = new ModalStack();
</script>

<script lang="ts">
	import {onMount, onDestroy} from 'svelte';
	import type {Cancellation, ModalOnStack} from './types.js';
	import {createFocusTrap, type FocusTargetOrFalse, type FocusTrap} from 'focus-trap';
	import {fade} from 'svelte/transition';

	export let oncancel: Cancellation | undefined = undefined;
	export let onclosed: Cancellation | undefined = undefined;

	let element: HTMLElement;
	let modal: ModalOnStack;
	onMount(() => {
		const trigger = document.querySelector(':focus-visible') || undefined;
		const currentTrap = modalStack.currentTrap;
		if (currentTrap) {
			try {
				currentTrap.deactivate();
			} catch {}
		}
		const newTrap = createFocusTrap(element, {
			returnFocusOnDeactivate: false,
			clickOutsideDeactivates: false,
			initialFocus: trigger ? undefined : false,
			allowOutsideClick: true,
		});
		try {
			newTrap.activate();
		} catch {}
		modalStack.currentTrap = newTrap;

		modal = {element, trigger, oncancel};
		modalStack.add(modal);

		return () => modalStack.remove(modal);
	});

	function onOutroStart() {
		modalStack.remove(modal, true);
		const currentTrap = modalStack.currentTrap;
		if (currentTrap) {
			try {
				currentTrap.deactivate();
			} catch {}
		}
		if (modalStack.list.length > 0) {
			const newModal = modalStack.list[modalStack.list.length - 1];
			const newTrap = createFocusTrap(newModal.element, {
				returnFocusOnDeactivate: false,
				clickOutsideDeactivates: false,
				initialFocus: (modal.trigger as FocusTargetOrFalse) || false,
				allowOutsideClick: true,
			});
			try {
				newTrap.activate();
			} catch {}
			modalStack.currentTrap = newTrap;
		} else {
			if ((modal.trigger as HTMLElement)?.focus) {
				(modal.trigger as HTMLElement).focus();
			}
		}
	}

	function onOutroEnd() {
		modalStack.onOutroEnd(modal);
		if (onclosed) {
			onclosed();
		}
	}

	function onBackdropInteraction(event: MouseEvent | TouchEvent): void {
		event.stopImmediatePropagation();
		event.preventDefault();
		event.stopPropagation();
		if (modal.oncancel) {
			return modal.oncancel();
		}
	}
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="modal-container" bind:this={element}>
	<div
		class="overlay"
		on:mousedown={onBackdropInteraction}
		on:touchstart={onBackdropInteraction}
		transition:fade
		on:outrostart={onOutroStart}
		on:outroend={onOutroEnd}
	></div>

	<slot />
</div>

<style>
	.overlay {
		pointer-events: initial;
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		background-color: black;
		opacity: 0.6;
	}
	.modal-container {
		pointer-events: initial;
	}
</style>
