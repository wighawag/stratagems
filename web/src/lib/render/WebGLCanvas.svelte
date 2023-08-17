<script lang="ts">
	import {ActionHandler} from '$lib/action/ActionHandler';
	import type {State} from '$lib/blockchain/state/State';
	import {onMount} from 'svelte';
	import {Camera} from './camera';
	import {WebGLRenderer} from './WebGLRenderer';
	export let state: State;

	let renderer: WebGLRenderer = new WebGLRenderer();
	let camera: Camera;
	function render(time: number) {
		renderer.render(time);
		requestAnimationFrame(render);
	}

	let error: string | undefined;
	onMount(() => {
		const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
		const gl = canvas.getContext('webgl2');
		if (!gl) {
			error = `could not create WebGL2 context`;
			throw new Error(error);
		}

		renderer.initialize(canvas, gl);

		camera = new Camera();
		camera.start(canvas, renderer);
		camera.subscribe((v) => renderer.updateView(v));

		const actionHandler = new ActionHandler();
		camera.onClick = (x, y) => {
			actionHandler.onCell(Math.floor(x), Math.floor(y));
		};

		state.subscribe(($state) => {
			renderer.updateState($state);
		});

		requestAnimationFrame(render);
	});
</script>

{#if error}
	{error}
{:else}
	<canvas id="canvas" style="width:100%; height: 100%; display: block; position: absolute; top: 0; left: 0;" />
{/if}
