<script lang="ts">
	import {ActionHandler} from '$lib/action/ActionHandler';
	import {onMount} from 'svelte';
	import {Application, Texture, Sprite} from 'pixi.js';
	import {Viewport} from 'pixi-viewport';
	import {Grid} from './grid/Grid';
	import {PIXIState} from './PIXIState';
	import type {ViewState} from '$lib/state/ViewState';

	export let state: ViewState;

	// let unsubscribe: (() => void) | undefined;

	onMount(() => {
		const canvas = document.querySelector('#canvas') as HTMLCanvasElement;
		canvas.onselectstart = () => false; // remove dbl-click select

		const app = new Application({
			view: canvas,
			resolution: 1, // window.devicePixelRatio || 1,
			// autoDensity: true,
			backgroundColor: 0x47aba9,
			resizeTo: window,
		});
		(window as any).__PIXI_APP__ = app;

		const grid = new Grid(1, [0x4a / 256, 0x4e / 256, 0x69 / 256, 1]);
		app.stage.addChild(grid);

		const viewport = new Viewport({
			// screenWidth: window.innerWidth,
			// screenHeight: window.innerHeight,
			worldWidth: 32,
			worldHeight: 32,
			allowPreserveDragOutside: true,
			// disableOnContextMenu: true,

			events: app.renderer.events, // the interaction module is important for wheel to work properly when renderer.view is placed or scaled
		});

		const pixiState = new PIXIState(viewport);
		const unsubscribe = state.subscribe(pixiState.update.bind(pixiState));

		const actionHandler = new ActionHandler();
		viewport.on('clicked', (ev) => {
			actionHandler.onCell(Math.floor(ev.world.x), Math.floor(ev.world.y));
		});

		// add the viewport to the stage
		app.stage.addChild(viewport);

		// activate plugins
		viewport.drag().wheel().pinch().clampZoom({maxScale: 100, minScale: 5});
		viewport.fitWorld();
		viewport.moveCenter(0, 0);

		viewport.on('moved', (ev) => {
			grid.setUniforms(viewport.corner, viewport);
		});
		viewport.on('zoomed', (ev) => {
			grid.setUniforms(viewport.corner, viewport);
		});
		grid.setUniforms(viewport.corner, viewport);
		const onResize = () => {
			app.renderer.resize(window.innerWidth, window.innerHeight);
			viewport.resize(window.innerWidth, window.innerHeight);
			grid.setUniforms(viewport.corner, viewport);
		};
		window.addEventListener('resize', onResize);

		// add a red box
		// const sprite = viewport.addChild(new Sprite(Texture.WHITE));
		// sprite.tint = 0xff0000;
		// sprite.width = sprite.height = 1;
		// sprite.position.set(0, 0);

		return unsubscribe;
	});
</script>

<canvas id="canvas" style="width:100%; height: 100%; display: block; position: absolute; top: 0; left: 0;" />
