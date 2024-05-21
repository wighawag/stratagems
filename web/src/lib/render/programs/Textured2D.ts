import * as twgl from 'twgl.js';

const vertexShaderSource = `#version 300 es

in vec2 a_position;
in vec2 a_tex;
in float a_alpha;

out vec2 v_tex;
out float v_alpha;
 
uniform mat3 u_matrix;

void main() {
  v_tex = a_tex;
  v_alpha = a_alpha;
  gl_Position = vec4((u_matrix * vec3(a_position, 1)).xy, 0, 1);
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

uniform sampler2D u_tex;

in vec2 v_tex;
in float v_alpha;

// we need to declare an output for the fragment shader
out vec4 outColor;

void main() {
  vec4 texColor = texture(u_tex, v_tex).rgba;
 texColor = texColor * v_alpha;
// texColor = texColor * 0.8;
//   texColor.a = 0.8;
  outColor = texColor;
}
`;

export type Attributes = {
	positions: {data: Float32Array; nextIndex: number};
	texs: {data: Float32Array; nextIndex: number};
	alphas: {data: Float32Array; nextIndex: number};
};

export class Textured2DProgram {
	programInfo!: twgl.ProgramInfo;
	bufferInfo!: twgl.BufferInfo;
	gl!: WebGL2RenderingContext;
	textures!: {[key: string]: WebGLTexture};
	attributes!: Attributes;

	constructor(public size: number) {}

	initialize(GL: WebGL2RenderingContext) {
		this.gl = GL;
		this.programInfo = twgl.createProgramInfo(GL, [vertexShaderSource, fragmentShaderSource]);

		const attributes = {
			a_position: {numComponents: 2, data: new Float32Array([])},
			a_tex: {numComponents: 2, data: new Float32Array([])},
			a_alpha: {numComponents: 1, data: new Float32Array([])},
		};
		this.bufferInfo = twgl.createBufferInfoFromArrays(GL, attributes);

		this.attributes = {
			positions: {data: new Float32Array(9999999), nextIndex: 0},
			texs: {data: new Float32Array(9999999), nextIndex: 0},
			alphas: {data: new Float32Array(9999999), nextIndex: 0},
		};
	}

	use() {
		const GL = this.gl;
		GL.useProgram(this.programInfo.program);
		GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);

		GL.enable(GL.BLEND);
		GL.disable(GL.DEPTH_TEST);
	}
}
