import * as twgl from 'twgl.js';
import * as m3 from '$utils/m3';
import type {CameraState} from '../camera';
import type {StratagemsViewState} from '$lib/state/ViewState';
import {Blockie} from '$utils/eth/blockie';

type Attributes = {positions: number[]; colors: number[]};

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
	attributes.positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
	for (let i = 0; i < 6; i++) {
		attributes.colors.push(...color);
	}
}

export class BlockiesLayer {
	programInfo!: twgl.ProgramInfo;
	bufferInfo!: twgl.BufferInfo;
	gl!: WebGL2RenderingContext;

	constructor(public size: number) {}

	initialize(GL: WebGL2RenderingContext) {
		this.gl = GL;
		this.programInfo = twgl.createProgramInfo(GL, [vertexShaderSource, fragmentShaderSource]);

		const attributes = {
			a_position: {numComponents: 2, data: new Float32Array([])},
			a_color: {numComponents: 3, data: new Float32Array([])},
		};
		this.bufferInfo = twgl.createBufferInfoFromArrays(GL, attributes);
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
		const attributes: Attributes = {
			positions: [],
			colors: [],
		};
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
						attributes.positions.push(l, t, r, t, l, b, l, b, r, t, r, b);

						let rgb = blockie.bgcolorRGB;
						if (data[i] === 1) {
							rgb = blockie.colorRGB;
						} else if (data[i] === 2) {
							rgb = blockie.spotcolorRGB;
						}
						for (let j = 0; j < 6; j++) {
							attributes.colors.push(...rgb);
						}
						i++;
					}
				}
				const doorThickness = this.size / 100;
				drawRect(
					attributes,
					x1 - doorThickness,
					y1 - doorThickness,
					x1 + blockieSize / 2 + doorThickness,
					y1,
					[1, 1, 1],
				);

				drawRect(attributes, x1 - doorThickness, y1 - doorThickness, x1, y1 + blockieSize / 2, [1, 1, 1]);
				drawRect(
					attributes,
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
					const thickness = this.size / 50;

					let startX = x;
					let endX = x + this.size;
					let startY = y;
					let endY = y + this.size;
					if (!neighbors.N) {
						startY += thickness;
					}
					if (!neighbors.S) {
						endY -= thickness;
					}
					if (!neighbors.W) {
						startX += thickness;
					}
					if (!neighbors.E) {
						endX -= thickness;
					}

					if (!neighbors.N) {
						drawRect(attributes, startX, startY, endX, startY + thickness, [0, 1, 0]);
					}

					if (!neighbors.S) {
						drawRect(attributes, startX, endY, endX, endY + thickness, [0, 1, 0]);
					}
					if (!neighbors.W) {
						drawRect(attributes, startX, startY, startX + thickness, endY, [0, 1, 0]);
					}
					if (!neighbors.E) {
						drawRect(attributes, endX, startY, endX + thickness, endY, [0, 1, 0]);
					}
				}
			}
		}
		// we update the buffer with the new arrays
		twgl.setAttribInfoBufferFromArray(GL, this.bufferInfo.attribs!.a_position, attributes.positions);
		twgl.setAttribInfoBufferFromArray(GL, this.bufferInfo.attribs!.a_color, attributes.colors);
		// we need to tell twgl the number of element to draw
		// see : https://github.com/greggman/twgl.js/issues/211
		this.bufferInfo.numElements = attributes.positions.length / 2;

		// we draw
		twgl.setBuffersAndAttributes(GL, this.programInfo, this.bufferInfo);
		twgl.setUniforms(this.programInfo, uniforms);
		twgl.drawBufferInfo(GL, this.bufferInfo, GL.TRIANGLES);
	}
}
