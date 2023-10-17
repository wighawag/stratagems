import * as twgl from 'twgl.js';
import * as m3 from '$lib/m3';
import type {CameraState} from '../camera';
import type {ViewData} from '$lib/state/ViewState';
import sheetURL from '$lib/assets/sheet.png';
import sheet from '$lib/assets/sheet.json';

type Frame = {x: number; y: number; w: number; h: number};
type FrameData = {
	frame: Frame;
	rotated: boolean;
	trimmed: boolean;
	spriteSourceSize: Frame;
	sourceSize: {w: number; h: number};
};

const size = sheet.meta.size;
const texPerSprites: {[key: string]: FrameData & {uvFrame: Frame; uv: number[]}} = sheet.frames as any;
for (const key of Object.keys(texPerSprites)) {
	const value = texPerSprites[key];
	const x = value.frame.x / size.w;
	const y = value.frame.y / size.h;
	const w = value.frame.w / size.w;
	const h = value.frame.h / size.h;
	value.uvFrame = {
		x,
		y,
		w,
		h,
	};
	const x1 = x;
	const x2 = x + w;
	const y1 = y;
	const y2 = y + h;
	value.uv = [x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2];
}
const grass = texPerSprites['grass/grass-1.png'];

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
			sheet: {src: sheetURL},
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

		const a_positions = [];
		const a_texs: number[] = [];
		for (let cellPos of Object.keys(state.cells)) {
			const cell = state.cells[cellPos];
			const [x, y] = cellPos.split(',').map((v) => parseInt(v));
			const width = this.size;
			const height = this.size;
			const x1 = x * this.size;
			const x2 = x * this.size + width;
			const y1 = y * this.size;
			const y2 = y * this.size + height;

			a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			a_texs.push(...grass.uv);
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
