import type {Data} from 'stratagems-indexer';
import * as twgl from 'twgl.js';
import * as m3 from '$lib/m3';
import {parseColorV4} from '$app/webgl/color';
import type {CameraState} from '../camera';

const vertexShaderSource = `#version 300 es
     
// an attribute is an input (in) to a vertex shader.
// It will receive data from a buffer
in vec2 a_position;
 
uniform mat3 u_matrix;

void main() {
	// Multiply the position by the matrix.
  gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
}
`;

const fragmentShaderSource = `#version 300 es
// fragment shaders don't have a default precision so we need
// to pick one. highp is a good default. It means "high precision"
precision highp float;

uniform vec4 u_color;

// we need to declare an output for the fragment shader
out vec4 outColor;

void main() {
	// Just set the output to a constant reddish-purple
	outColor = u_color;
}
`;

const COLORS = [
	[0, 0, 0, 1],
	parseColorV4('ef476f'),
	parseColorV4('ffd166'),
	parseColorV4('06d6a0'),
	parseColorV4('118ab2'),
];

export class Colored2DLayer {
	programInfo: twgl.ProgramInfo;
	bufferInfo: twgl.BufferInfo;
	gl: WebGL2RenderingContext;

	constructor(public size: number, public tickness: number) {}

	initialize(GL: WebGL2RenderingContext) {
		this.gl = GL;
		this.programInfo = twgl.createProgramInfo(GL, [vertexShaderSource, fragmentShaderSource]);

		const attributes = {
			a_position: {numComponents: 2, data: new Float32Array([])},
		};
		this.bufferInfo = twgl.createBufferInfoFromArrays(GL, attributes);
	}

	use() {
		this.gl.useProgram(this.programInfo.program);
	}

	render(cameraState: CameraState, state: Data) {
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

		// const arrays = {
		// 	a_position: {numComponents: 2, data: []},
		// };
		// const startX = Math.floor((cameraState.x - cameraState.width / 2) / size) * size - size - tickness / 2;
		// const endX = cameraState.x + cameraState.width / 2 - tickness / 2;

		// const startY = Math.floor((cameraState.y - cameraState.height / 2) / size) * size - size - tickness / 2;
		// const endY = cameraState.y + cameraState.height / 2 - tickness / 2;

		// const jump = cameraState.renderScale < 10 ? 2 : 1;
		// for (let x = startX; x < endX; x += size * jump) {
		// 	arrays.a_position.data.push(
		// 		x,
		// 		startY,
		// 		x + tickness,
		// 		startY,
		// 		x + tickness,
		// 		endY,
		// 		x + tickness,
		// 		endY,
		// 		x,
		// 		endY,
		// 		x,
		// 		startY
		// 	);
		// }
		// for (let y = startY; y < endY; y += size * jump) {
		// 	arrays.a_position.data.push(
		// 		startX,
		// 		y,
		// 		endX,
		// 		y,
		// 		endX,
		// 		y + tickness,
		// 		endX,
		// 		y + tickness,
		// 		startX,
		// 		y + tickness,
		// 		startX,
		// 		y
		// 	);
		// }
		// bufferInfo = twgl.createBufferInfoFromArrays(GL, arrays, bufferInfo);
		// twgl.setBuffersAndAttributes(GL, colored2d, bufferInfo);
		// twgl.setUniforms(colored2d, uniforms);
		// twgl.drawBufferInfo(GL, bufferInfo, GL.TRIANGLES);

		for (let cellPos of Object.keys(state.cells)) {
			const cell = state.cells[cellPos];
			const [x, y] = cellPos.split(',').map((v) => parseInt(v));
			const width = this.size;
			const height = this.size;
			var x1 = x * this.size + this.tickness / 2;
			var x2 = x * this.size + width - this.tickness / 2;
			var y1 = y * this.size + this.tickness / 2;
			var y2 = y * this.size + height - this.tickness / 2;

			// twgl.setAttribInfoBufferFromArray(GL, this.bufferInfo.attribs.a_position, {
			// 	numComponents: 2,
			// 	data: [x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2],
			// });

			const attributes = {
				a_position: {numComponents: 2, data: [x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2]},
			};
			this.bufferInfo = twgl.createBufferInfoFromArrays(GL, attributes, this.bufferInfo);

			twgl.setBuffersAndAttributes(GL, this.programInfo, this.bufferInfo);

			uniforms.u_color = COLORS[cell.color];
			twgl.setUniforms(this.programInfo, uniforms);

			twgl.drawBufferInfo(GL, this.bufferInfo, GL.TRIANGLES);
		}
	}
}
