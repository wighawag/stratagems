import type {Data} from 'stratagems-indexer';
import {writable, type Readable, type Subscriber, type Unsubscriber, type Writable} from 'svelte/store';
import * as twgl from 'twgl.js';
import type {CameraState} from './camera';
import type {RenderViewState} from './renderview';
import {GridLayer} from './programs/Grid';
import {Colored2DLayer} from './programs/Colored2D';

export class WebGLRenderer implements Readable<RenderViewState> {
	private state!: Data;
	private canvas!: HTMLCanvasElement;
	private gl!: WebGL2RenderingContext;
	private cameraState!: CameraState;
	private store: Writable<RenderViewState>;
	private gridLayer: GridLayer = new GridLayer(1);
	private cellLayer: Colored2DLayer = new Colored2DLayer(1, 0.1);

	constructor() {
		this.store = writable({devicePixelRatio: 1, width: 0, height: 0});
	}

	subscribe(run: Subscriber<RenderViewState>, invalidate?: (value?: RenderViewState) => void): Unsubscriber {
		return this.store.subscribe(run, invalidate);
	}
	updateState(state: Data) {
		this.state = state;
	}
	updateView(cameraState: CameraState) {
		this.cameraState = cameraState;
	}

	initialize(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
		this.canvas = canvas;
		this.gl = gl;
		this.store.set({
			devicePixelRatio: window.devicePixelRatio,
			width: this.canvas.width,
			height: this.canvas.height,
		});
		this.gridLayer.initialize(gl);
		this.cellLayer.initialize(gl);
	}

	render(time: number) {
		const GL = this.gl;

		if (twgl.resizeCanvasToDisplaySize(this.canvas)) {
			this.store.set({
				devicePixelRatio: window.devicePixelRatio,
				width: this.canvas.width,
				height: this.canvas.height,
			});
		}
		GL.viewport(0, 0, this.canvas.width, this.canvas.height);

		GL.clearColor(0, 0, 0, 0);
		GL.clear(GL.COLOR_BUFFER_BIT);

		this.gridLayer.use();
		this.gridLayer.render(this.cameraState);

		// this.cellLayer.use();
		// this.cellLayer.render(this.cameraState, this.state);
	}
}
