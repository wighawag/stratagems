import * as twgl from 'twgl.js';
import * as m3 from '$lib/m3';
import type {CameraState} from '../camera';
import type {ViewData} from '$lib/state/ViewState';
import {drawCastle, drawCorners, drawGrassCenter, drawHouse, sheetURL} from '../tiles';

const vertexShaderSource = `#version 300 es

in vec2 a_position;
in vec2 a_tex;
// in float alpha;

out vec2 v_tex;
// out float vAlpha;
 
uniform mat3 u_matrix;

void main() {
  v_tex = a_tex;
  // vAlpha = alpha;
  gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

uniform sampler2D u_tex;

in vec2 v_tex;
// in float vAlpha;

// we need to declare an output for the fragment shader
out vec4 outColor;

void main() {
  vec4 texColor = texture(u_tex, v_tex).rgba;
  // texColor = texColor * vAlpha;
  outColor = texColor;
}
`;

export class Textured2DLayer {
	programInfo!: twgl.ProgramInfo;
	bufferInfo!: twgl.BufferInfo;
	gl!: WebGL2RenderingContext;
	textures!: {[key: string]: WebGLTexture};

	constructor(public size: number) {}

	initialize(GL: WebGL2RenderingContext) {
		this.gl = GL;
		this.programInfo = twgl.createProgramInfo(GL, [vertexShaderSource, fragmentShaderSource]);

		const attributes = {
			a_position: {numComponents: 2, data: new Float32Array([])},
			a_tex: {numComponents: 2, data: new Float32Array([])},
		};
		this.bufferInfo = twgl.createBufferInfoFromArrays(GL, attributes);

		this.textures = twgl.createTextures(GL, {
			sheet: {src: sheetURL, mag: GL.NEAREST},
		});
	}

	use() {
		this.gl.useProgram(this.programInfo.program);
	}

	render(cameraState: CameraState, state: ViewData) {
		const GL = this.gl;
		// Compute the matrices
		var projectionMatrix = m3.projection(cameraState.renderWidth, cameraState.renderHeight);
		var scaleMatrix = m3.scaling(cameraState.renderScale, cameraState.renderScale);
		var translationMatrix = m3.translation(cameraState.renderX, cameraState.renderY);

		var viewMatrix = m3.multiply(translationMatrix, scaleMatrix);

		var matrix = m3.multiply(projectionMatrix, viewMatrix);
		const uniforms = {
			u_matrix: matrix,
			u_tex: this.textures['sheet'],
		};

		const numTiles = 6;
		const tileSize = this.size / (numTiles + 1);
		const offset = tileSize / 2;
		const a_positions: number[] = [];
		const a_texs: number[] = [];
		for (let cellPos of Object.keys(state.cells)) {
			const cell = state.cells[cellPos];
			const [x, y] = cellPos.split(',').map((v) => parseInt(v));
			const neighbors = {
				N: !!state.cells[`${x},${y - 1}`],
				NE: !!state.cells[`${x + 1},${y - 1}`],
				E: !!state.cells[`${x + 1},${y}`],
				SE: !!state.cells[`${x + 1},${y + 1}`],
				S: !!state.cells[`${x},${y + 1}`],
				SW: !!state.cells[`${x - 1},${y + 1}`],
				W: !!state.cells[`${x - 1},${y}`],
				NW: !!state.cells[`${x - 1},${y - 1}`],
			};
			drawCorners(a_positions, a_texs, this.size, offset, neighbors, tileSize, x, y);
		}

		for (let cellPos of Object.keys(state.cells)) {
			const cell = state.cells[cellPos];
			const [x, y] = cellPos.split(',').map((v) => parseInt(v));
			drawGrassCenter(a_positions, a_texs, this.size, offset, tileSize, numTiles, x, y);

			drawCastle(a_positions, a_texs, this.size, tileSize, x, y, cell.next.color);

			// for (let i = 0; i < cell.next.life; i++) {
			// 	const offset = 0.2 * tileSize;
			// 	const margin = 0.3 * tileSize;
			// 	drawHouse(offset + margin * (i % 3), offset + margin * Math.floor(i / 3));
			// }
			// if (cell.future.life > cell.next.life) {
			// 	for (let i = cell.next.life; i < cell.future.life; i++) {
			// 		const offset = 0.2 * tileSize;
			// 		const margin = 0.3 * tileSize;

			// 		drawHouse(offset + margin * (i % 3), offset + margin * Math.floor(i / 3));
			// 	}
			// } else if (cell.future.life < cell.next.life) {
			// 	for (let i = Math.max(0, cell.next.life - (cell.next.life - cell.future.life)); i < cell.next.life; i++) {
			// 		const offset = 0.2 * tileSize;
			// 		const margin = 0.3 * tileSize;
			// 		drawHouse(offset + margin * (i % 3), offset + margin * Math.floor(i / 3));
			// 	}
			// }
		}

		// we update the buffer with the new arrays
		twgl.setAttribInfoBufferFromArray(GL, this.bufferInfo.attribs!.a_position, a_positions);
		twgl.setAttribInfoBufferFromArray(GL, this.bufferInfo.attribs!.a_tex, a_texs);
		// we need to tell twgl the number of element to draw
		// see : https://github.com/greggman/twgl.js/issues/211
		this.bufferInfo.numElements = a_positions.length / 2;

		// we draw
		twgl.setBuffersAndAttributes(GL, this.programInfo, this.bufferInfo);
		twgl.setUniforms(this.programInfo, uniforms);
		twgl.drawBufferInfo(GL, this.bufferInfo, GL.TRIANGLES);
	}
}