<script lang="ts">
	import {ActionHandler} from '$lib/actions/ActionHandler';
	import {onMount} from 'svelte';
	import {camera} from './camera';
	import {WebGLRenderer} from './WebGLRenderer';
	import type {StratagemsView} from '$lib/state/ViewState';
	export let state: StratagemsView;

	let renderer: WebGLRenderer = new WebGLRenderer();
	function render(time: number) {
		renderer.render(time);
		animationFrameID = requestAnimationFrame(render);
	}

	let animationFrameID: number;
	let unsubscribeFromCamera: () => void;
	let unsubscribeFromState: () => void;

	let error: string | undefined;
	onMount(() => {
		const canvas = document.querySelector('#canvas') as HTMLCanvasElement;

		// prevent selection of text when start dragging on canvas
		// TODO we should actually disable pointer events for all elements in the way
		//   and reenable when dragging on canvas stop
		canvas.onselectstart = () => false;

		// const gl = canvas.getContext('webgl2', {alpha: false});
		const gl = canvas.getContext('webgl2');
		if (!gl) {
			error = `could not create WebGL2 context`;
			throw new Error(error);
		}

		renderer.initialize(canvas, gl);

		camera.start(canvas, renderer);
		unsubscribeFromCamera = camera.subscribe((v) => renderer.updateView(v));

		const actionHandler = new ActionHandler();
		camera.onClick = (x, y) => {
			actionHandler.onCellClicked(Math.floor(x), Math.floor(y));
		};

		unsubscribeFromState = state.subscribe(($state) => {
			renderer.updateState($state);
		});

		animationFrameID = requestAnimationFrame(render);

		return () => {
			camera.stop();
			cancelAnimationFrame(animationFrameID);
			unsubscribeFromCamera();
			unsubscribeFromState();
		};
	});
</script>

{#if error}
	{error}
{:else}
	<canvas
		id="canvas"
		style="background-color: white; position: absolute; width:100%; height: 100%; pointer-events: auto;"
	/>
	<div
		id="canvas-overlay"
		style="position: absolute;width:100%; height: 100%; pointer-events: none; overflow: hidden;"
	></div>
{/if}
