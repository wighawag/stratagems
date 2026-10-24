<!--
	A sized box to mount `Canvas2DCanvas` into.

	The host's canvas is `position: absolute; width: 100%; height: 100%`, so it
	measures whatever contains it. In a test nothing does, and a zero-sized
	surface draws nothing at all - which would make every pixel assertion below
	pass vacuously. Hence a container with real dimensions.
-->
<script lang="ts">
	import Canvas2DCanvas from '$lib/game/render/canvas2d/Canvas2DCanvas.svelte';
	import type {CameraControl} from '$lib/game/render/camera';
	import type {CanvasEventEmitter} from '$lib/game/render/events';
	import type {GameRenderer} from '$lib/game/core/seams';

	interface Props {
		cameraControl: CameraControl;
		renderer: GameRenderer<CanvasRenderingContext2D>;
		eventEmitter: CanvasEventEmitter;
		width: number;
		height: number;
		showGrid?: boolean;
		backgroundColor?: string;
	}
	let {
		cameraControl,
		renderer,
		eventEmitter,
		width,
		height,
		showGrid = false,
		backgroundColor = '#0b1020',
	}: Props = $props();
</script>

<div style="position: relative; width: {width}px; height: {height}px;">
	<Canvas2DCanvas
		{cameraControl}
		{renderer}
		{eventEmitter}
		{showGrid}
		{backgroundColor}
		cellSize={32}
		gridCells={64}
	/>
</div>
