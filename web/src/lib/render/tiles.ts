import sheetURL from '$lib/assets/sheet.png';
import sheet from '$lib/assets/sheet.json';

export {sheetURL};

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

export type Neighbors = {
	N: boolean;
	NE: boolean;
	E: boolean;
	SE: boolean;
	S: boolean;
	SW: boolean;
	W: boolean;
	NW: boolean;
};

export function drawCorners(
	a_positions: number[],
	a_texs: number[],
	cellSize: number,
	offset: number,
	neighbors: Neighbors,
	tileSize: number,
	x: number,
	y: number,
) {
	if (!neighbors.N && !neighbors.NE && !neighbors.E) {
		drawNorthEast000(a_positions, a_texs, x - offset + cellSize, y + offset, tileSize);
	} else if (neighbors.N && !neighbors.NE && !neighbors.E) {
		drawNorthEast100(a_positions, a_texs, x - offset + cellSize, y + offset, tileSize);
	} else if (!neighbors.N && !neighbors.NE && neighbors.E) {
		drawNorthEast001(a_positions, a_texs, x - offset + cellSize, y + offset, tileSize);
	} else if (!neighbors.N && neighbors.NE && !neighbors.E) {
		drawNorthEast010(a_positions, a_texs, x - offset + cellSize, y + offset, tileSize);
	} else if (neighbors.N && neighbors.NE && !neighbors.E) {
		drawNorthEast110(a_positions, a_texs, x - offset + cellSize, y + offset, tileSize);
	} else if (!neighbors.N && neighbors.NE && neighbors.E) {
		drawNorthEast011(a_positions, a_texs, x - offset + cellSize, y + offset, tileSize);
	} else if (neighbors.N && !neighbors.NE && neighbors.E) {
		drawNorthEast101(a_positions, a_texs, x - offset + cellSize, y + offset, tileSize);
	} else {
		drawNorthEast111(a_positions, a_texs, x - offset + cellSize, y + offset, tileSize);
	}

	if (!neighbors.SW) {
		if (!neighbors.W && !neighbors.S) {
			drawSouthWest00(a_positions, a_texs, x + offset, y - offset + cellSize, tileSize);
		} else if (neighbors.W && !neighbors.S) {
			drawSouthWest10(a_positions, a_texs, x + offset, y - offset + cellSize, tileSize);
		} else if (!neighbors.W && neighbors.S) {
			drawSouthWest01(a_positions, a_texs, x + offset, y - offset + cellSize, tileSize);
		} else {
			drawSouthWest11(a_positions, a_texs, x + offset, y - offset + cellSize, tileSize);
		}
	}

	if (!neighbors.S && !neighbors.E) {
		if (!neighbors.SE) {
			drawSouthEast0(a_positions, a_texs, x - offset + cellSize, y - offset + cellSize, tileSize);
		} else {
			drawSouthEast1(a_positions, a_texs, x - offset + cellSize, y - offset + cellSize, tileSize);
		}
	}

	if (!neighbors.W && !neighbors.N && !neighbors.NW) {
		drawNorthWest(a_positions, a_texs, x + offset, y + offset, tileSize);
	}
}

export function drawGrassCenter(
	a_positions: number[],
	a_texs: number[],
	cellSize: number,
	offset: number,
	tileSize: number,
	numTiles: number,
	x: number,
	y: number,
) {
	for (let cy = 0; cy < numTiles; cy++) {
		for (let cx = 0; cx < numTiles; cx++) {
			const x1 = offset + x * cellSize + cx * tileSize;
			const x2 = x1 + tileSize;
			const y1 = offset + y * cellSize + cy * tileSize;
			const y2 = y1 + tileSize;

			a_positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
			a_texs.push(...grasses[(cx + cy) % 8].uv);
		}
	}
}
