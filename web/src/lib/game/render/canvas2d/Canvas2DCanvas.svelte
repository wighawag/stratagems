<!--
	A canvas-2d surface for a `GameRenderer<CanvasRenderingContext2D>`.

	The immediate-mode host, and the proof that the render seam is a seam. Its
	props are IDENTICAL to `PixiCanvas.svelte`'s, so a game switches renderer by
	changing which component it loads and nothing else: the camera, the gestures,
	the click-to-cell wiring and the game itself are unchanged. That property is
	the whole point, so if you add a prop to one host, add it to the other.

	A twgl or three.js host is this file with `getContext('2d')` replaced and the
	surface type changed. Nothing else here is about canvas-2d: the gestures, the
	resize observer and the click wiring are `connectSurfaceInput`, and the frame
	arithmetic is `createFrameLoop`.
-->
<script lang="ts">
	import {onMount} from 'svelte';
	import type {CameraControl} from '../camera';
	import type {GameRenderer} from '$lib/game/core/seams';
	import type {CanvasEventEmitter} from '../events';
	import {connectSurfaceInput} from '../input';
	import {createFrameLoop} from '../frame-loop';
	import {applyCamera, beginFrame, drawGrid} from './draw';

	interface Props {
		cameraControl: CameraControl;
		renderer: GameRenderer<CanvasRenderingContext2D>;
		eventEmitter: CanvasEventEmitter;
		/**
		 * Unused here: an immediate renderer draws in game units, so it has no
		 * content authored in pixels to scale. Accepted so the two hosts take the
		 * same props and swapping one for the other changes no call site.
		 */
		cellSize?: number;
		showGrid?: boolean;
		backgroundColor?: string;
		/** Unused here: this host strokes only the grid lines that are visible. */
		gridCells?: number;
	}
	let {
		cameraControl,
		renderer,
		eventEmitter,
		showGrid = true,
		backgroundColor = '#0b1020',
	}: Props = $props();

	let canvas: HTMLCanvasElement;

	/**
	 * Set when the surface cannot be created at all, and rendered below.
	 *
	 * Reported as STATE rather than thrown. The page's `{#await}` has a `:catch`,
	 * but that only sees the dynamic import rejecting, and there is no
	 * `<svelte:boundary>` in this app, so throwing from `onMount` would give an
	 * unhandled component error and a blank rectangle: the exact silent failure
	 * the page's error panel exists to prevent.
	 */
	let failure = $state<string | undefined>(undefined);

	onMount(() => {
		// Before anything is wired: if this fails there is nothing to tear down,
		// and `onMount` returning early would otherwise strand the resize observer
		// and five listeners that `connectSurfaceInput` had already attached.
		const context = canvas.getContext('2d');
		if (!context) {
			failure = 'This browser could not provide a 2D canvas context.';
			return;
		}

		const input = connectSurfaceInput({
			element: canvas,
			cameraControl,
			eventEmitter,
		});
		const frames = createFrameLoop({
			cameraControl,
			devicePixelRatio: () => window.devicePixelRatio || 1,
		});

		let frameHandle = 0;

		function draw(now: number) {
			frameHandle = requestAnimationFrame(draw);
			const frame = frames.advanceTo(now);

			// The backing store is sized in DEVICE pixels while everything above is
			// in CSS pixels, and it is resized only when it actually changed:
			// assigning `canvas.width` clears the canvas even when the value is the
			// same, which turns a no-op into a flicker.
			const width = Math.round(frame.screen.width * frame.devicePixelRatio);
			const height = Math.round(frame.screen.height * frame.devicePixelRatio);
			if (canvas.width !== width || canvas.height !== height) {
				canvas.width = width;
				canvas.height = height;
			}
			if (width === 0 || height === 0) return;

			beginFrame({
				context: context!,
				screen: frame.screen,
				devicePixelRatio: frame.devicePixelRatio,
				background: backgroundColor,
			});
			applyCamera({
				context: context!,
				transform: frame.transform,
				screen: frame.screen,
			});
			if (showGrid) {
				drawGrid({
					context: context!,
					transform: frame.transform,
					screen: frame.screen,
				});
			}

			renderer.tick(frame);
		}

		// Started synchronously, unlike the pixi host: a 2d context needs no async
		// initialisation, so there is no window in which the component can unmount
		// between starting and being able to stop.
		renderer.onAppStarted(context);
		frameHandle = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(frameHandle);
			input.dispose();
			renderer.onAppStopped();
		};
	});

	function onCanvasContextMenu(event: Event) {
		event.preventDefault();
	}
</script>

<canvas oncontextmenu={onCanvasContextMenu} bind:this={canvas}></canvas>

{#if failure}
	<div class="absolute inset-0 flex items-center justify-center p-4">
		<p class="max-w-md text-center text-sm text-red-400">{failure}</p>
	</div>
{/if}

<style>
	canvas {
		position: absolute;
		width: 100%;
		height: 100%;
		pointer-events: auto;
		image-rendering: pixelated;
		/* Same reason as the pixi host: without it a touch drag scrolls the page. */
		touch-action: none;
	}
</style>
