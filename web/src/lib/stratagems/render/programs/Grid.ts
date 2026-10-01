import {parseColorV4} from '$utils/webgl/color';
import * as twgl from 'twgl.js';
import type {CameraState} from '../camera';

const vertexShaderSource = `#version 300 es

in vec3 position;
void main() {
  gl_Position = vec4( position, 1.0 );
}
`;

const fragmentShaderSource = `#version 300 es
// fragment shaders don't have a default precision so we need
// to pick one. highp is a good default. It means "high precision"
precision highp float;

uniform vec4 u_color;
uniform vec4 u_bgColor;
uniform float u_size;
uniform vec2 u_offset; 

// we need to declare an output for the fragment shader
out vec4 outColor;

void main() {    
  if (int(mod(gl_FragCoord.x + u_offset[0], u_size)) == 0 || int(mod(gl_FragCoord.y + u_offset[1], u_size)) == 0) {
    outColor = mix(u_color, u_bgColor, 4.0 / u_size);
  } else {
    outColor = u_bgColor;
  }
}
`;

const GRID_COLORS = {
	lines: parseColorV4('777777'),
	background: parseColorV4('5c699f'),
};

export class GridLayer {
	programInfo!: twgl.ProgramInfo;
	bufferInfo!: twgl.BufferInfo;
	gl!: WebGL2RenderingContext;

	constructor(public size: number) {}

	initialize(GL: WebGL2RenderingContext) {
		this.gl = GL;
		this.programInfo = twgl.createProgramInfo(GL, [vertexShaderSource, fragmentShaderSource]);

		const attributes = {
			position: {numComponents: 2, data: [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0]},
		};
		this.bufferInfo = twgl.createBufferInfoFromArrays(GL, attributes);
	}

	use() {
		this.gl.useProgram(this.programInfo.program);
	}

	render(cameraState: CameraState) {
		const GL = this.gl;
		twgl.setBuffersAndAttributes(GL, this.programInfo, this.bufferInfo);
		const offsetX =
			cameraState.x -
			cameraState.width / 2 -
			Math.floor((cameraState.x - cameraState.width / 2) / this.size) * this.size;
		const offsetY =
			Math.floor((cameraState.y - cameraState.height / 2) / this.size) * this.size -
			cameraState.y -
			cameraState.height / 2;

		const gridUniforms = {
			u_offset: [offsetX * cameraState.renderScale, offsetY * cameraState.renderScale],
			u_size: cameraState.renderScale,
			u_color: GRID_COLORS.lines,
			u_bgColor: GRID_COLORS.background,
		};
		twgl.setUniforms(this.programInfo, gridUniforms);
		twgl.drawBufferInfo(GL, this.bufferInfo, GL.TRIANGLES);
	}
}
