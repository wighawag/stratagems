<script lang="ts">
	import {camera} from '$lib/render/camera';
	export let x: number;
	export let y: number;

	let screenPos: {x: number; y: number} = {x: 0, y: 0};
	let zoom: number = 1;
	$: {
		if ($camera) {
			zoom = $camera.zoom;
			screenPos = camera.worldToScreen(x + 0.5, y + 0.5);
		}
	}

	import {portal} from 'svelte-portal';
</script>

<div
	class="overlay"
	use:portal={'#canvas-overlay'}
	hidden
	style={`transform: translate(calc(${screenPos.x}px - 50%), calc(${screenPos.y}px - 50%));`}
>
	<slot />
</div>

<style>
	.overlay {
		pointer-events: none;
		position: absolute;
		top: 0;
		left: 0;
	}
</style>
