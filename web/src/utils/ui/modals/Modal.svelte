<script lang="ts">
	import {fly} from 'svelte/transition';
	import ModalContainer from './ModalContainer.svelte';
	import {type Cancellation} from './types.js';

	export let oncancel: Cancellation = undefined;
	export let onclosed: Cancellation = undefined;
	export let style: string | undefined = undefined;
</script>

<ModalContainer {oncancel} {onclosed}>
	<div class="modal" transition:fly={{y: '50vh'}} {style}>
		<slot />
	</div>
</ModalContainer>

<style>
	.modal {
		/* background-color: var(--color-surface-800); */

		overflow: hidden;

		border: 64px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) fill 16 repeat;
		image-rendering: pixelated;

		/* border: 32px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/wooden-frame.png) fill 7 repeat;
		image-rendering: pixelated; */

		/* border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/paper-frame.png) fill 4 repeat;
		image-rendering: pixelated;
		color: black; */

		/* border: 42px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/wooden-frame-2.png) fill 7 repeat;
		image-rendering: pixelated;
		color: black; */

		/* background-color: var(--color-surface-800, var(--background-color, red)); */
		box-shadow:
			0 10px 15px -3px rgba(0, 0, 0, 0.1),
			0 4px 6px -2px rgba(0, 0, 0, 0.05);
		padding: 1rem;

		position: fixed;

		left: 50%;
		transform: translate(-50%, 0%);
		bottom: 0;

		height: var(--height, 400px);
		max-height: 100%;

		width: 100%;
		border-radius: 1rem 1rem 0 0;
		overflow: auto;
	}

	@media (min-width: 640px) {
		.modal {
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);

			width: var(--width, 600px);
			max-width: 100%;

			border-radius: 1rem;
		}
	}
</style>
