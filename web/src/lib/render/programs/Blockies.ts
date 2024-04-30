import * as twgl from 'twgl.js';
import * as m3 from '$utils/m3';
import type {CameraState} from '../camera';
import type {StratagemsViewState} from '$lib/state/ViewState';
import {Blockie} from '$utils/ethereum/blockie';
import {Color, bigIntIDToXYID} from 'stratagems-common';

type Attributes = {positions: {data: Float32Array; nextIndex: number}; colors: {data: Float32Array; nextIndex: number}};

const vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec3 a_color;

uniform mat3 u_matrix;

out vec3 v_color; 

void main() {
  v_color = a_color;
  gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec3 v_color; 

out vec4 outColor;

void main() {
	outColor = vec4(v_color, 1.0);
}
`;

function drawRect(attributes: Attributes, x1: number, y1: number, x2: number, y2: number, color: number[]) {
	{
		let i = attributes.positions.nextIndex;
		attributes.positions.data[i++] = x1;
		attributes.positions.data[i++] = y1;
		attributes.positions.data[i++] = x2;
		attributes.positions.data[i++] = y1;
		attributes.positions.data[i++] = x1;
		attributes.positions.data[i++] = y2;
		attributes.positions.data[i++] = x1;
		attributes.positions.data[i++] = y2;
		attributes.positions.data[i++] = x2;
		attributes.positions.data[i++] = y1;
		attributes.positions.data[i++] = x2;
		attributes.positions.data[i++] = y2;
		attributes.positions.nextIndex = i;
	}
	{
		let ni = attributes.colors.nextIndex;
		for (let i = 0; i < 6; i++) {
			for (let c of color) {
				attributes.colors.data[ni++] = c;
			}
		}
		attributes.colors.nextIndex = ni;
	}
}

function drawEmptyRect(
	attributes: Attributes,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	color: number[],
	thichness: number,
) {
	drawRect(attributes, x1 - thichness / 2, y1 - thichness / 2, x2 + thichness / 2, y1 + thichness / 2, color);
	drawRect(attributes, x2 - thichness / 2, y1 - thichness / 2, x2 + thichness / 2, y2 + thichness / 2, color);
	drawRect(attributes, x2 + thichness / 2, y2 + thichness / 2, x1 - thichness / 2, y2 - thichness / 2, color);
	drawRect(attributes, x1 - thichness / 2, y2 - thichness / 2, x1 + thichness / 2, y1 + thichness / 2, color);
}

export class BlockiesLayer {
	programInfo!: twgl.ProgramInfo;
	bufferInfo!: twgl.BufferInfo;
	gl!: WebGL2RenderingContext;
	attributes!: Attributes;

	constructor(public size: number) {}

	initialize(GL: WebGL2RenderingContext) {
		this.gl = GL;
		this.programInfo = twgl.createProgramInfo(GL, [vertexShaderSource, fragmentShaderSource]);

		const attributes = {
			a_position: {numComponents: 2, data: new Float32Array([])},
			a_color: {numComponents: 3, data: new Float32Array([])},
		};
		this.bufferInfo = twgl.createBufferInfoFromArrays(GL, attributes);

		this.attributes = {
			positions: {data: new Float32Array(999999), nextIndex: 0},
			colors: {data: new Float32Array(9999999), nextIndex: 0},
		};
	}

	use() {
		const GL = this.gl;
		GL.useProgram(this.programInfo.program);
	}

	render(cameraState: CameraState, state: StratagemsViewState) {
		const GL = this.gl;
		// Compute the matrices
		var projectionMatrix = m3.projection(cameraState.renderWidth, cameraState.renderHeight);
		var scaleMatrix = m3.scaling(cameraState.renderScale, cameraState.renderScale);
		var translationMatrix = m3.translation(cameraState.renderX, cameraState.renderY);

		var viewMatrix = m3.multiply(translationMatrix, scaleMatrix);

		var matrix = m3.multiply(projectionMatrix, viewMatrix);
		const uniforms = {
			u_matrix: matrix,
			u_color: [0, 0, 0, 1],
		};

		const numTiles = 6;
		const tileSize = this.size / (numTiles + 1);
		const offset = tileSize / 2;
		this.attributes.positions.nextIndex = 0;
		this.attributes.colors.nextIndex = 0;
		for (let cellPos of Object.keys(state.cells)) {
			const cell = state.viewCells[cellPos];
			const owner = state.owners[cellPos];
			if (owner && owner != '0x0000000000000000000000000000000000000000') {
				const blockie = Blockie.get(owner);
				const data = blockie.imageData;
				const [x, y] = cellPos.split(',').map((v) => parseInt(v));

				const blockieSize = tileSize * 2;

				const x1 = x + this.size / 2 - blockieSize / 4;
				const y1 = y + this.size / 2 - blockieSize / 4 + (tileSize * 4) / 5;
				// const x2 = x1 + tileSize;
				// const y2 = y1 + tileSize;

				let i = 0;
				for (let y = 0; y < 8; y++) {
					for (let x = 0; x < 8; x++) {
						const l = x1 + (x * blockieSize) / 16;
						const r = l + blockieSize / 16;
						const t = y1 + (y * blockieSize) / 16;
						const b = t + blockieSize / 16;

						{
							let i = this.attributes.positions.nextIndex;
							this.attributes.positions.data[i++] = l;
							this.attributes.positions.data[i++] = t;
							this.attributes.positions.data[i++] = r;
							this.attributes.positions.data[i++] = t;
							this.attributes.positions.data[i++] = l;
							this.attributes.positions.data[i++] = b;
							this.attributes.positions.data[i++] = l;
							this.attributes.positions.data[i++] = b;
							this.attributes.positions.data[i++] = r;
							this.attributes.positions.data[i++] = t;
							this.attributes.positions.data[i++] = r;
							this.attributes.positions.data[i++] = b;
							this.attributes.positions.nextIndex = i;
						}

						let rgb = blockie.bgcolorRGB;
						if (data[i] === 1) {
							rgb = blockie.colorRGB;
						} else if (data[i] === 2) {
							rgb = blockie.spotcolorRGB;
						}
						{
							let ni = this.attributes.colors.nextIndex;
							for (let i = 0; i < 6; i++) {
								for (let c of rgb) {
									this.attributes.colors.data[ni++] = c;
								}
							}
							this.attributes.colors.nextIndex = ni;
						}
						i++;
					}
				}
				const doorThickness = this.size / 100;
				drawRect(
					this.attributes,
					x1 - doorThickness,
					y1 - doorThickness,
					x1 + blockieSize / 2 + doorThickness,
					y1,
					[1, 1, 1],
				);

				drawRect(this.attributes, x1 - doorThickness, y1 - doorThickness, x1, y1 + blockieSize / 2, [1, 1, 1]);
				drawRect(
					this.attributes,
					x1 + blockieSize / 2 - -doorThickness,
					y1 - doorThickness,
					x1 + blockieSize / 2,
					y1 + blockieSize / 2,
					[1, 1, 1],
				);

				if (cell.currentPlayer) {
					const neighbors = {
						N: state.viewCells[`${x},${y - 1}`]?.currentPlayer || false,
						E: state.viewCells[`${x + 1},${y}`]?.currentPlayer || false,
						S: state.viewCells[`${x},${y + 1}`]?.currentPlayer || false,
						W: state.viewCells[`${x - 1},${y}`]?.currentPlayer || false,
					};
					const thickness = this.size / Math.min(cameraState.zoom / 2, 50);

					let startX = x - thickness / 2;
					let endX = x + this.size - thickness / 2;
					let startY = y - thickness / 2;
					let endY = y + this.size - thickness / 2;

					if (!neighbors.N) {
						drawRect(this.attributes, startX, startY, endX, startY + thickness, [0, 1, 0]);
					}

					if (!neighbors.S) {
						drawRect(this.attributes, startX, endY, endX, endY + thickness, [0, 1, 0]);
					}
					if (!neighbors.W) {
						drawRect(this.attributes, startX, startY, startX + thickness, endY, [0, 1, 0]);
					}
					if (!neighbors.E) {
						drawRect(this.attributes, endX, startY, endX + thickness, endY, [0, 1, 0]);
					}
				}
			}
		}

		for (const withdrawal of state.tokensToCollect) {
			const thickness = this.size / Math.min(cameraState.zoom / 2, 50);
			const fromPos = bigIntIDToXYID(withdrawal.from);
			const toPos = bigIntIDToXYID(withdrawal.position);
			const [fromX, fromY] = fromPos.split(',').map((v) => parseInt(v));
			const [toX, toY] = toPos.split(',').map((v) => parseInt(v));

			const x1 = fromX + this.size / 2;
			const y1 = fromY + this.size / 2;
			let x2 = toX + this.size / 2 + thickness;
			let y2 = toY + this.size / 2 + thickness;

			// const slope = (y2 - y1) / (x2 - x1);
			x2 = x2 - (x2 - x1) / 5;
			y2 = y2 - (y2 - y1) / 5;

			drawEmptyRect(
				this.attributes,
				toX + this.size / 2 - this.size / 4,
				toY + this.size / 2 - this.size / 4,
				toX + this.size / 2 + this.size / 4,
				toY + this.size / 2 + this.size / 4,
				[0, 1, 1],
				thickness,
			);

			let color = [0, 1, 1];

			// TODO colors ?
			// if (withdrawal.color === Color.Red) {
			// 	color = [1, 0, 0];
			// }
			drawRect(this.attributes, x1, y1, x2, y2, color);
		}

		// we update the buffer with the new arrays
		twgl.setAttribInfoBufferFromArray(GL, this.bufferInfo.attribs!.a_position, this.attributes.positions);
		twgl.setAttribInfoBufferFromArray(GL, this.bufferInfo.attribs!.a_color, this.attributes.colors);
		// we need to tell twgl the number of element to draw
		// see : https://github.com/greggman/twgl.js/issues/211
		this.bufferInfo.numElements = this.attributes.positions.nextIndex / 2;

		// we draw
		twgl.setBuffersAndAttributes(GL, this.programInfo, this.bufferInfo);
		twgl.setUniforms(this.programInfo, uniforms);
		twgl.drawBufferInfo(GL, this.bufferInfo, GL.TRIANGLES);
	}
}
