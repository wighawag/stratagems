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

type SheetData = typeof sheet;

type FrameDataWithUV = FrameData & {uvFrame: Frame; uv: number[]};

type TextureData = {
	[Property in keyof SheetData['frames']]: FrameDataWithUV;
};

const size = sheet.meta.size;
const texPerSprites: TextureData = sheet.frames as any;
for (const key of Object.keys(texPerSprites)) {
	const value = (texPerSprites as any)[key] as FrameDataWithUV;
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
const grasses = [
	texPerSprites['grass/grass-1.png'],
	texPerSprites['grass/grass-2.png'],
	texPerSprites['grass/grass-3.png'],
	texPerSprites['grass/grass-4.png'],
	texPerSprites['grass/grass-5.png'],
	texPerSprites['grass/grass-6.png'],
	texPerSprites['grass/grass-7.png'],
	texPerSprites['grass/grass-8.png'],
];

const sandGrasses = [
	texPerSprites['transitions/grass-sand/grass-sand-0.png'],
	texPerSprites['transitions/grass-sand/grass-sand-1.png'],
	texPerSprites['transitions/grass-sand/grass-sand-2.png'],
	texPerSprites['transitions/grass-sand/grass-sand-3.png'],
	texPerSprites['transitions/grass-sand/grass-sand-4.png'],
	texPerSprites['transitions/grass-sand/grass-sand-5.png'],
	texPerSprites['transitions/grass-sand/grass-sand-6.png'],
	texPerSprites['transitions/grass-sand/grass-sand-7.png'],
	texPerSprites['transitions/grass-sand/grass-sand-8.png'],
	texPerSprites['transitions/grass-sand/grass-sand-9.png'],
	texPerSprites['transitions/grass-sand/grass-sand-10.png'],
	texPerSprites['transitions/grass-sand/grass-sand-11.png'],
	texPerSprites['transitions/grass-sand/grass-sand-12.png'],
	texPerSprites['transitions/grass-sand/grass-sand-13.png'],
	texPerSprites['transitions/grass-sand/grass-sand-14.png'],
];

const sandSeaLight = [
	texPerSprites['transitions/sand-seawater-light/sand-seawater-light-0.png'],
	texPerSprites['transitions/sand-seawater-light/sand-seawater-light-1.png'],
	texPerSprites['transitions/sand-seawater-light/sand-seawater-light-2.png'],
	texPerSprites['transitions/sand-seawater-light/sand-seawater-light-3.png'],
	texPerSprites['transitions/sand-seawater-light/sand-seawater-light-4.png'],
	texPerSprites['transitions/sand-seawater-light/sand-seawater-light-5.png'],
	texPerSprites['transitions/sand-seawater-light/sand-seawater-light-6.png'],
	texPerSprites['transitions/sand-seawater-light/sand-seawater-light-7.png'],
	texPerSprites['transitions/sand-seawater-light/sand-seawater-light-8.png'],
	texPerSprites['transitions/sand-seawater-light/sand-seawater-light-9.png'],
	texPerSprites['transitions/sand-seawater-light/sand-seawater-light-10.png'],
	texPerSprites['transitions/sand-seawater-light/sand-seawater-light-11.png'],
	texPerSprites['transitions/sand-seawater-light/sand-seawater-light-12.png'],
];
const seaLightMedium = [
	texPerSprites['transitions/seawater-light-seawater-medium/seawater-light-seawater-medium-0.png'],
	texPerSprites['transitions/seawater-light-seawater-medium/seawater-light-seawater-medium-1.png'],
	texPerSprites['transitions/seawater-light-seawater-medium/seawater-light-seawater-medium-2.png'],
	texPerSprites['transitions/seawater-light-seawater-medium/seawater-light-seawater-medium-3.png'],
	texPerSprites['transitions/seawater-light-seawater-medium/seawater-light-seawater-medium-4.png'],
	texPerSprites['transitions/seawater-light-seawater-medium/seawater-light-seawater-medium-5.png'],
	texPerSprites['transitions/seawater-light-seawater-medium/seawater-light-seawater-medium-6.png'],
	texPerSprites['transitions/seawater-light-seawater-medium/seawater-light-seawater-medium-7.png'],
	texPerSprites['transitions/seawater-light-seawater-medium/seawater-light-seawater-medium-8.png'],
	texPerSprites['transitions/seawater-light-seawater-medium/seawater-light-seawater-medium-9.png'],
	texPerSprites['transitions/seawater-light-seawater-medium/seawater-light-seawater-medium-10.png'],
	texPerSprites['transitions/seawater-light-seawater-medium/seawater-light-seawater-medium-11.png'],
	texPerSprites['transitions/seawater-light-seawater-medium/seawater-light-seawater-medium-12.png'],
];
const seaMediumDeep = [
	texPerSprites['transitions/seawater-medium-seawater-deep/seawater-medium-seawater-deep-0.png'],
	texPerSprites['transitions/seawater-medium-seawater-deep/seawater-medium-seawater-deep-1.png'],
	texPerSprites['transitions/seawater-medium-seawater-deep/seawater-medium-seawater-deep-2.png'],
	texPerSprites['transitions/seawater-medium-seawater-deep/seawater-medium-seawater-deep-3.png'],
	texPerSprites['transitions/seawater-medium-seawater-deep/seawater-medium-seawater-deep-4.png'],
	texPerSprites['transitions/seawater-medium-seawater-deep/seawater-medium-seawater-deep-5.png'],
	texPerSprites['transitions/seawater-medium-seawater-deep/seawater-medium-seawater-deep-6.png'],
	texPerSprites['transitions/seawater-medium-seawater-deep/seawater-medium-seawater-deep-7.png'],
	texPerSprites['transitions/seawater-medium-seawater-deep/seawater-medium-seawater-deep-8.png'],
	texPerSprites['transitions/seawater-medium-seawater-deep/seawater-medium-seawater-deep-9.png'],
	texPerSprites['transitions/seawater-medium-seawater-deep/seawater-medium-seawater-deep-10.png'],
	texPerSprites['transitions/seawater-medium-seawater-deep/seawater-medium-seawater-deep-11.png'],
	texPerSprites['transitions/seawater-medium-seawater-deep/seawater-medium-seawater-deep-12.png'],
];

function drawTile(
	a_positions: number[],
	a_texs: number[],
	x1: number,
	y1: number,
	tile: FrameDataWithUV,
	tileSize: number,
) {
	const x2 = x1 + tileSize;
	const y2 = y1 + tileSize;

	a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
	a_texs.push(...tile.uv);
}
function drawTileRow(p: number[], t: number[], x: number, y: number, tile: FrameDataWithUV, s: number, num: number) {
	for (let i = 0; i < num; i++) {
		drawTile(p, t, x + i * s, y, tile, s);
	}
}
function drawTileCol(p: number[], t: number[], x: number, y: number, tile: FrameDataWithUV, s: number, num: number) {
	for (let i = 0; i < num; i++) {
		drawTile(p, t, x, y + i * s, tile, s);
	}
}

function drawEmptyBottomRightCorner(p: number[], t: number[], x: number, y: number, s: number) {
	// diagonal
	drawTile(p, t, x + s * 1, y - s * 0, sandSeaLight[0], s);
	drawTile(p, t, x + s * 2, y + s * 1, seaLightMedium[0], s);
	drawTile(p, t, x + s * 3, y + s * 2, seaMediumDeep[0], s);

	drawTileRow(p, t, x + s * 1, y - s * 1, sandGrasses[1], s, 3);
	drawTileRow(p, t, x + s * 2, y - s * 0, sandSeaLight[1], s, 2);
	drawTile(p, t, x + s * 3, y + s * 1, seaLightMedium[1], s);

	drawTileCol(p, t, x - s * 0, y - s * 0, sandGrasses[5], s, 3);
	drawTileCol(p, t, x + s * 1, y + s * 1, sandSeaLight[5], s, 2);
	drawTile(p, t, x + s * 2, y + s * 2, seaLightMedium[5], s);
}

function drawEmptyBottomLeftCorner(p: number[], t: number[], x: number, y: number, s: number) {
	// diagonal
	drawTile(p, t, x - s * 2, y + s * 1, sandSeaLight[2], s);
	drawTile(p, t, x - s * 3, y + s * 2, seaLightMedium[2], s);
	drawTile(p, t, x - s * 4, y + s * 3, seaMediumDeep[2], s);

	drawTileRow(p, t, x - s * 4, y + s * 0, sandGrasses[1], s, 3);
	drawTileRow(p, t, x - s * 4, y + s * 1, sandSeaLight[1], s, 2);
	drawTile(p, t, x - s * 4, y + s * 2, seaLightMedium[1], s);

	drawTileCol(p, t, x - s * 1, y + s * 1, sandGrasses[7], s, 3);
	drawTileCol(p, t, x - s * 2, y + s * 2, sandSeaLight[7], s, 2);
	drawTile(p, t, x - s * 3, y + s * 3, seaLightMedium[7], s);
}

function drawEmptyTopLeftCorner(p: number[], t: number[], x: number, y: number, s: number) {
	// diagonal
	drawTile(p, t, x - s * 3, y - s * 4, seaMediumDeep[12], s);
	drawTile(p, t, x - s * 2, y - s * 3, seaLightMedium[12], s);
	drawTile(p, t, x - s * 1, y - s * 2, sandSeaLight[12], s);

	drawTile(p, t, x - s * 2, y - s * 4, seaLightMedium[7], s);
	drawTileCol(p, t, x - s * 1, y - s * 4, sandSeaLight[7], s, 2);
	drawTileCol(p, t, x - s * 0, y - s * 4, sandGrasses[7], s, 3);

	drawTile(p, t, x - s * 3, y - s * 3, seaLightMedium[11], s);
	drawTileRow(p, t, x - s * 3, y - s * 2, sandSeaLight[11], s, 2);
	drawTileRow(p, t, x - s * 3, y - s * 1, sandGrasses[11], s, 3);
}

function drawEmptyTopRightCorner(p: number[], t: number[], x: number, y: number, s: number) {
	// diagonal
	drawTile(p, t, x + s * 3, y - s * 4, seaMediumDeep[10], s);
	drawTile(p, t, x + s * 2, y - s * 3, seaLightMedium[10], s);
	drawTile(p, t, x + s * 1, y - s * 2, sandSeaLight[10], s);

	drawTile(p, t, x + s * 2, y - s * 4, seaLightMedium[5], s);
	drawTileCol(p, t, x + s * 1, y - s * 4, sandSeaLight[5], s, 2);
	drawTileCol(p, t, x + s * 0, y - s * 4, sandGrasses[5], s, 3);

	drawTile(p, t, x + s * 3, y - s * 3, seaLightMedium[11], s);
	drawTileRow(p, t, x + s * 2, y - s * 2, sandSeaLight[11], s, 2);
	drawTileRow(p, t, x + s * 1, y - s * 1, sandGrasses[11], s, 3);
}

function drawNorthEast000(p: number[], t: number[], x: number, y: number, s: number) {
	drawTileRow(p, t, x - s * 3, y - s * 4, seaMediumDeep[11], s, 6);
	drawTile(p, t, x + s * 3, y - s * 4, seaMediumDeep[8], s);
	drawTileCol(p, t, x + s * 3, y - s * 3, seaMediumDeep[5], s, 6);

	drawTileRow(p, t, x - s * 3, y - s * 3, seaLightMedium[11], s, 5);
	drawTile(p, t, x + s * 2, y - s * 3, seaLightMedium[8], s);
	drawTileCol(p, t, x + s * 2, y - s * 2, seaLightMedium[5], s, 5);

	drawTileRow(p, t, x - s * 3, y - s * 2, sandSeaLight[11], s, 4);
	drawTile(p, t, x + s * 1, y - s * 2, sandSeaLight[8], s);
	drawTileCol(p, t, x + s * 1, y - s * 1, sandSeaLight[5], s, 4);

	drawTileRow(p, t, x - s * 3, y - s * 1, sandGrasses[11], s, 4);
	drawTile(p, t, x + s * 0, y - s * 1, sandGrasses[8], s);
	drawTileCol(p, t, x + s * 0, y - s * 0, sandGrasses[5], s, 4);
}

function drawNorthEast100(p: number[], t: number[], x: number, y: number, s: number) {
	drawTileRow(p, t, x - s * 3, y - s * 1, grasses[1], s, 3); // TODO randomize

	drawTileCol(p, t, x + s * 3, y - s * 4, seaMediumDeep[5], s, 7);
	drawTileCol(p, t, x + s * 2, y - s * 4, seaLightMedium[5], s, 7);
	drawTileCol(p, t, x + s * 1, y - s * 4, sandSeaLight[5], s, 7);
	drawTileCol(p, t, x + s * 0, y - s * 4, sandGrasses[5], s, 7);
}

function drawNorthEast001(p: number[], t: number[], x: number, y: number, s: number) {
	drawTileCol(p, t, x - s * 0, y - s * 0, grasses[1], s, 3); // TODO randomize

	drawTileRow(p, t, x - s * 3, y - s * 4, seaMediumDeep[11], s, 7);
	drawTileRow(p, t, x - s * 3, y - s * 3, seaLightMedium[11], s, 7);
	drawTileRow(p, t, x - s * 3, y - s * 2, sandSeaLight[11], s, 7);
	drawTileRow(p, t, x - s * 3, y - s * 1, sandGrasses[11], s, 7);
}

function drawNorthEast010(p: number[], t: number[], x: number, y: number, s: number) {
	// diagonal
	drawTile(p, t, x - s * 0, y - s * 1, sandGrasses[13], s);

	drawEmptyTopLeftCorner(p, t, x, y, s);
	drawEmptyBottomRightCorner(p, t, x, y, s);
}

function drawNorthEast110(p: number[], t: number[], x: number, y: number, s: number) {
	// diagonal
	drawTile(p, t, x - s * 0, y - s * 1, sandGrasses[0], s);

	drawEmptyBottomRightCorner(p, t, x, y, s);

	drawTileRow(p, t, x - s * 3, y - s * 1, grasses[1], s, 3); // TODO randomize
	drawTileCol(p, t, x - s * 0, y - s * 4, grasses[1], s, 3); // TODO randomize
}

function drawNorthEast011(p: number[], t: number[], x: number, y: number, s: number) {
	// diagonal
	drawTile(p, t, x - s * 0, y - s * 1, sandGrasses[12], s);

	drawEmptyTopLeftCorner(p, t, x, y, s);

	drawTileRow(p, t, x + s * 1, y - s * 1, grasses[1], s, 3); // TODO randomize
	drawTileCol(p, t, x - s * 0, y - s * 0, grasses[1], s, 3); // TODO randomize
}

function drawNorthEast101(p: number[], t: number[], x: number, y: number, s: number) {
	// diagonal
	drawTile(p, t, x - s * 0, y - s * 1, sandGrasses[10], s);

	drawEmptyTopRightCorner(p, t, x, y, s);

	drawTileRow(p, t, x - s * 3, y - s * 1, grasses[1], s, 3); // TODO randomize
	drawTileCol(p, t, x - s * 0, y - s * 0, grasses[1], s, 3); // TODO randomize
}

function drawNorthEast111(p: number[], t: number[], x: number, y: number, s: number) {
	drawTileRow(p, t, x - s * 3, y - s * 1, grasses[1], s, 7); // TODO randomize
	drawTileCol(p, t, x - s * 0, y - s * 4, grasses[1], s, 3); // TODO randomize
	drawTileCol(p, t, x - s * 0, y - s * 0, grasses[1], s, 3); // TODO randomize
}

function drawSouthWest00(p: number[], t: number[], x: number, y: number, s: number) {
	drawTileCol(p, t, x - s * 4, y - s * 3, seaMediumDeep[7], s, 6);
	drawTile(p, t, x - s * 4, y + s * 3, seaMediumDeep[4], s);
	drawTileRow(p, t, x - s * 3, y + s * 3, seaMediumDeep[1], s, 6);

	drawTileCol(p, t, x - s * 3, y - s * 3, seaLightMedium[7], s, 5);
	drawTile(p, t, x - s * 3, y + s * 2, seaLightMedium[4], s);
	drawTileRow(p, t, x - s * 2, y + s * 2, seaLightMedium[1], s, 5);

	drawTileCol(p, t, x - s * 2, y - s * 3, sandSeaLight[7], s, 4);
	drawTile(p, t, x - s * 2, y + s * 1, sandSeaLight[4], s);
	drawTileRow(p, t, x - s * 1, y + s * 1, sandSeaLight[1], s, 4);

	drawTileCol(p, t, x - s * 1, y - s * 3, sandGrasses[7], s, 3);
	drawTile(p, t, x - s * 1, y + s * 0, sandGrasses[4], s);
	drawTileRow(p, t, x - s * 0, y + s * 0, sandGrasses[1], s, 3);
}

function drawSouthWest10(p: number[], t: number[], x: number, y: number, s: number) {
	drawTileCol(p, t, x - s * 1, y - s * 3, grasses[1], s, 3); // TODO randomize

	drawTileRow(p, t, x - s * 4, y + s * 3, seaMediumDeep[1], s, 7);
	drawTileRow(p, t, x - s * 4, y + s * 2, seaLightMedium[1], s, 7);
	drawTileRow(p, t, x - s * 4, y + s * 1, sandSeaLight[1], s, 7);
	drawTileRow(p, t, x - s * 4, y + s * 0, sandGrasses[1], s, 7);
}

function drawSouthWest01(p: number[], t: number[], x: number, y: number, s: number) {
	drawTileRow(p, t, x - s * 0, y - s * 0, grasses[1], s, 3); // TODO randomize

	drawTileCol(p, t, x - s * 4, y - s * 3, seaMediumDeep[7], s, 7);
	drawTileCol(p, t, x - s * 3, y - s * 3, seaLightMedium[7], s, 7);
	drawTileCol(p, t, x - s * 2, y - s * 3, sandSeaLight[7], s, 7);
	drawTileCol(p, t, x - s * 1, y - s * 3, sandGrasses[7], s, 7);
}

function drawSouthWest11(p: number[], t: number[], x: number, y: number, s: number) {
	drawTile(p, t, x - s * 1, y - s * 0, sandGrasses[2], s);
	drawEmptyBottomLeftCorner(p, t, x, y, s);

	drawTileRow(p, t, x - s * 0, y - s * 0, grasses[1], s, 3); // TODO randomize
	drawTileCol(p, t, x - s * 1, y - s * 3, grasses[1], s, 3); // TODO randomize
}

function drawSouthEast0(p: number[], t: number[], x: number, y: number, s: number) {
	drawTileRow(p, t, x - s * 3, y + s * 3, seaMediumDeep[1], s, 6);
	drawTile(p, t, x + s * 3, y + s * 3, seaMediumDeep[3], s);
	drawTileCol(p, t, x + s * 3, y - s * 3, seaMediumDeep[5], s, 6);

	drawTileRow(p, t, x - s * 3, y + s * 2, seaLightMedium[1], s, 5);
	drawTile(p, t, x + s * 2, y + s * 2, seaLightMedium[3], s);
	drawTileCol(p, t, x + s * 2, y - s * 3, seaLightMedium[5], s, 5);

	drawTileRow(p, t, x - s * 3, y + s * 1, sandSeaLight[1], s, 4);
	drawTile(p, t, x + s * 1, y + s * 1, sandSeaLight[3], s);
	drawTileCol(p, t, x + s * 1, y - s * 3, sandSeaLight[5], s, 4);

	drawTileRow(p, t, x - s * 3, y + s * 0, sandGrasses[1], s, 3);
	drawTile(p, t, x + s * 0, y + s * 0, sandGrasses[3], s);
	drawTileCol(p, t, x + s * 0, y - s * 3, sandGrasses[5], s, 3);
}

function drawSouthEast1(p: number[], t: number[], x: number, y: number, s: number) {
	drawTile(p, t, x - s * 0, y - s * 0, sandGrasses[14], s);
	drawEmptyBottomLeftCorner(p, t, x + s, y, s);
	drawEmptyTopRightCorner(p, t, x, y + s, s);
}

function drawNorthWest(p: number[], t: number[], x: number, y: number, s: number) {
	drawTileCol(p, t, x - s * 4, y - s * 3, seaMediumDeep[7], s, 6);
	drawTile(p, t, x - s * 4, y - s * 4, seaMediumDeep[9], s);
	drawTileRow(p, t, x - s * 3, y - s * 4, seaMediumDeep[11], s, 6);

	drawTileCol(p, t, x - s * 3, y - s * 2, seaLightMedium[7], s, 5);
	drawTile(p, t, x - s * 3, y - s * 3, seaLightMedium[9], s);
	drawTileRow(p, t, x - s * 2, y - s * 3, seaLightMedium[11], s, 5);

	drawTileCol(p, t, x - s * 2, y - s * 1, sandSeaLight[7], s, 4);
	drawTile(p, t, x - s * 2, y - s * 2, sandSeaLight[9], s);
	drawTileRow(p, t, x - s * 1, y - s * 2, sandSeaLight[11], s, 4);

	drawTileCol(p, t, x - s * 1, y - s * 0, sandGrasses[7], s, 3);
	drawTile(p, t, x - s * 1, y - s * 1, sandGrasses[9], s);
	drawTileRow(p, t, x - s * 0, y - s * 1, sandGrasses[11], s, 3);
}

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

		const a_positions: number[] = [];
		const a_texs: number[] = [];
		for (let cellPos of Object.keys(state.cells)) {
			const cell = state.cells[cellPos];
			const [x, y] = cellPos.split(',').map((v) => parseInt(v));
			const width = this.size;
			const height = this.size;

			const numTiles = 6;
			const tileSize = this.size / (numTiles + 1);
			const offset = tileSize / 2;

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

			if (!neighbors.N && !neighbors.NE && !neighbors.E) {
				drawNorthEast000(a_positions, a_texs, x - offset + this.size, y + offset, tileSize);
			} else if (neighbors.N && !neighbors.NE && !neighbors.E) {
				drawNorthEast100(a_positions, a_texs, x - offset + this.size, y + offset, tileSize);
			} else if (!neighbors.N && !neighbors.NE && neighbors.E) {
				drawNorthEast001(a_positions, a_texs, x - offset + this.size, y + offset, tileSize);
			} else if (!neighbors.N && neighbors.NE && !neighbors.E) {
				drawNorthEast010(a_positions, a_texs, x - offset + this.size, y + offset, tileSize);
			} else if (neighbors.N && neighbors.NE && !neighbors.E) {
				drawNorthEast110(a_positions, a_texs, x - offset + this.size, y + offset, tileSize);
			} else if (!neighbors.N && neighbors.NE && neighbors.E) {
				drawNorthEast011(a_positions, a_texs, x - offset + this.size, y + offset, tileSize);
			} else if (neighbors.N && !neighbors.NE && neighbors.E) {
				drawNorthEast101(a_positions, a_texs, x - offset + this.size, y + offset, tileSize);
			} else {
				drawNorthEast111(a_positions, a_texs, x - offset + this.size, y + offset, tileSize);
			}

			if (!neighbors.SW) {
				if (!neighbors.W && !neighbors.S) {
					drawSouthWest00(a_positions, a_texs, x + offset, y - offset + this.size, tileSize);
				} else if (neighbors.W && !neighbors.S) {
					drawSouthWest10(a_positions, a_texs, x + offset, y - offset + this.size, tileSize);
				} else if (!neighbors.W && neighbors.S) {
					drawSouthWest01(a_positions, a_texs, x + offset, y - offset + this.size, tileSize);
				} else {
					drawSouthWest11(a_positions, a_texs, x + offset, y - offset + this.size, tileSize);
				}
			}

			if (!neighbors.S && !neighbors.E) {
				if (!neighbors.SE) {
					drawSouthEast0(a_positions, a_texs, x - offset + this.size, y - offset + this.size, tileSize);
				} else {
					drawSouthEast1(a_positions, a_texs, x - offset + this.size, y - offset + this.size, tileSize);
				}
			}

			if (!neighbors.W && !neighbors.N && !neighbors.NW) {
				drawNorthWest(a_positions, a_texs, x + offset, y + offset, tileSize);
			}

			// for (let cy = 0; cy < numTiles; cy++) {
			// 	for (let cx = 0; cx < numTiles; cx++) {
			// 		const x1 = offset + x * this.size + cx * tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = offset + y * this.size + cy * tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...grasses[(cx + cy) % 8].uv);
			// 	}
			// }

			// if (cell.next.)

			// for (let cx = 0; cx < numTiles; cx++) {
			// 	// -------------------------------------------
			// 	// TOP
			// 	// -------------------------------------------
			// 	// we draw the top sand
			// 	{
			// 		const x1 = offset + x * this.size + cx * tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = y - offset;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...sandGrasses[11].uv);
			// 	}

			// 	// we draw the top light sea
			// 	{
			// 		const x1 = offset + x * this.size + cx * tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = y - offset - tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...sandSeaLight[11].uv);
			// 	}

			// 	// we draw the top medium sea
			// 	{
			// 		const x1 = offset + x * this.size + cx * tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = y - offset - tileSize - tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...seaLightMedium[11].uv);
			// 	}

			// 	// we draw the top deep sea
			// 	{
			// 		const x1 = offset + x * this.size + cx * tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = y - offset - tileSize - tileSize - tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...seaMediumDeep[11].uv);
			// 	}
			// 	// -------------------------------------------

			// 	// -------------------------------------------
			// 	// BOTTOM
			// 	// -------------------------------------------
			// 	{
			// 		const x1 = offset + x * this.size + cx * tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = y - offset + this.size;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...sandGrasses[1].uv);
			// 	}
			// 	{
			// 		const x1 = offset + x * this.size + cx * tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = y - offset + this.size + tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...sandSeaLight[1].uv);
			// 	}
			// 	{
			// 		const x1 = offset + x * this.size + cx * tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = y - offset + this.size + tileSize + tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...seaLightMedium[1].uv);
			// 	}
			// 	{
			// 		const x1 = offset + x * this.size + cx * tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = y - offset + this.size + tileSize + tileSize + tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...seaMediumDeep[1].uv);
			// 	}
			// 	// -------------------------------------------
			// }
			// for (let cy = 0; cy < numTiles; cy++) {
			// 	// -------------------------------------------
			// 	// LEFT
			// 	// -------------------------------------------
			// 	{
			// 		const x1 = x - offset;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = offset + y * this.size + cy * tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...sandGrasses[7].uv);
			// 	}
			// 	{
			// 		const x1 = x - offset - tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = offset + y * this.size + cy * tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...sandSeaLight[7].uv);
			// 	}
			// 	{
			// 		const x1 = x - offset - tileSize - tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = offset + y * this.size + cy * tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...seaLightMedium[7].uv);
			// 	}
			// 	{
			// 		const x1 = x - offset - tileSize - tileSize - tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = offset + y * this.size + cy * tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...seaMediumDeep[7].uv);
			// 	}
			// 	// -------------------------------------------

			// 	// -------------------------------------------
			// 	// RIGHT
			// 	// -------------------------------------------
			// 	{
			// 		const x1 = x - offset + this.size;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = offset + y * this.size + cy * tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...sandGrasses[5].uv);
			// 	}
			// 	{
			// 		const x1 = x - offset + this.size + tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = offset + y * this.size + cy * tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...sandSeaLight[5].uv);
			// 	}
			// 	{
			// 		const x1 = x - offset + this.size + tileSize + tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = offset + y * this.size + cy * tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...seaLightMedium[5].uv);
			// 	}
			// 	{
			// 		const x1 = x - offset + this.size + tileSize + tileSize + tileSize;
			// 		const x2 = x1 + tileSize;
			// 		const y1 = offset + y * this.size + cy * tileSize;
			// 		const y2 = y1 + tileSize;

			// 		a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 		a_texs.push(...seaMediumDeep[5].uv);
			// 	}
			// 	// -------------------------------------------
			// }

			// // -------------------------------------------
			// // TOP LEFT CORNER
			// // -------------------------------------------
			// {
			// 	const x1 = x - offset;
			// 	const x2 = x1 + tileSize;
			// 	const y1 = y - offset;
			// 	const y2 = y1 + tileSize;

			// 	a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 	a_texs.push(...sandGrasses[9].uv);
			// }
			// // light sea
			// {
			// 	const x1 = x - offset - tileSize;
			// 	const x2 = x1 + tileSize;
			// 	const y1 = y - offset;
			// 	const y2 = y1 + tileSize;

			// 	a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 	a_texs.push(...sandSeaLight[7].uv);
			// }
			// {
			// 	const x1 = x - offset - tileSize;
			// 	const x2 = x1 + tileSize;
			// 	const y1 = y - offset - tileSize;
			// 	const y2 = y1 + tileSize;

			// 	a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 	a_texs.push(...sandSeaLight[9].uv);
			// }
			// {
			// 	const x1 = x - offset;
			// 	const x2 = x1 + tileSize;
			// 	const y1 = y - offset - tileSize;
			// 	const y2 = y1 + tileSize;

			// 	a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 	a_texs.push(...sandSeaLight[11].uv);
			// }
			// // medium sea
			// {
			// 	const x1 = x - offset - tileSize * 2;
			// 	const x2 = x1 + tileSize;
			// 	const y1 = y - offset;
			// 	const y2 = y1 + tileSize;

			// 	a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 	a_texs.push(...seaLightMedium[7].uv);
			// }
			// {
			// 	const x1 = x - offset - tileSize * 2;
			// 	const x2 = x1 + tileSize;
			// 	const y1 = y - offset - tileSize * 2;
			// 	const y2 = y1 + tileSize;

			// 	a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 	a_texs.push(...seaLightMedium[9].uv);
			// }
			// {
			// 	const x1 = x - offset;
			// 	const x2 = x1 + tileSize;
			// 	const y1 = y - offset - tileSize * 2;
			// 	const y2 = y1 + tileSize;

			// 	a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 	a_texs.push(...seaLightMedium[11].uv);
			// }
			// // -------------------------------------------

			// // -------------------------------------------
			// // TOP RIGHT CORNER
			// // -------------------------------------------
			// {
			// 	const x1 = x - offset + this.size;
			// 	const x2 = x1 + tileSize;
			// 	const y1 = y - offset;
			// 	const y2 = y1 + tileSize;

			// 	a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 	a_texs.push(...sandGrasses[8].uv);
			// }
			// // -------------------------------------------

			// // -------------------------------------------
			// // BOTTOM LEFT CORNER
			// // -------------------------------------------
			// {
			// 	const x1 = x - offset;
			// 	const x2 = x1 + tileSize;
			// 	const y1 = y - offset + this.size;
			// 	const y2 = y1 + tileSize;

			// 	a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 	a_texs.push(...sandGrasses[4].uv);
			// }
			// // -------------------------------------------

			// // -------------------------------------------
			// // BOTTOM RIGHT CORNER
			// // -------------------------------------------
			// {
			// 	const x1 = x - offset + this.size;
			// 	const x2 = x1 + tileSize;
			// 	const y1 = y - offset + this.size;
			// 	const y2 = y1 + tileSize;

			// 	a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			// 	a_texs.push(...sandGrasses[3].uv);
			// }
			// // -------------------------------------------
		}

		// -------------------------------------------
		// CORE GRASS
		// -------------------------------------------
		for (let cellPos of Object.keys(state.cells)) {
			const cell = state.cells[cellPos];
			const [x, y] = cellPos.split(',').map((v) => parseInt(v));
			const width = this.size;
			const height = this.size;

			const numTiles = 6;
			const tileSize = this.size / (numTiles + 1);
			const offset = tileSize / 2;

			for (let cy = 0; cy < numTiles; cy++) {
				for (let cx = 0; cx < numTiles; cx++) {
					const x1 = offset + x * this.size + cx * tileSize;
					const x2 = x1 + tileSize;
					const y1 = offset + y * this.size + cy * tileSize;
					const y2 = y1 + tileSize;

					a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
					a_texs.push(...grasses[(cx + cy) % 8].uv);
				}
			}
		}
		// -------------------------------------------

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
