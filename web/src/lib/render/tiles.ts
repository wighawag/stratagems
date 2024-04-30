import sheetURL from '$data/assets/sheet.png';
import sheet from '$data/assets/sheet.json';
import {Color} from 'stratagems-common';

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

const houses = {
	[Color.Blue]: texPerSprites['buildings/blue-house.png'],
	[Color.Red]: texPerSprites['buildings/red-house.png'],
	[Color.Green]: texPerSprites['buildings/green-house.png'],
	[Color.Yellow]: texPerSprites['buildings/orange-house.png'],
	[Color.Purple]: texPerSprites['buildings/purple-house.png'],
	[Color.Evil]: texPerSprites['buildings/black-house.png'],
};

const tents = {
	[Color.Blue]: texPerSprites['buildings/blue-tent.png'],
	[Color.Red]: texPerSprites['buildings/red-tent.png'],
	[Color.Green]: texPerSprites['buildings/green-tent.png'],
	[Color.Yellow]: texPerSprites['buildings/yellow-tent.png'],
	[Color.Purple]: texPerSprites['buildings/purple-tent.png'],
	[Color.Evil]: texPerSprites['buildings/black-tent.png'],
};

const castles = {
	[Color.Blue]: texPerSprites['buildings/blue-castle-01.png'],
	[Color.Red]: texPerSprites['buildings/red-castle-04.png'],
	[Color.Green]: texPerSprites['buildings/green-castle-02.png'],
	[Color.Yellow]: texPerSprites['buildings/orange-castle-03.png'],
	[Color.Purple]: texPerSprites['buildings/purple-castle-05.png'],
	[Color.Evil]: texPerSprites['buildings/black-castle-06.png'],
};

const soldiers = {
	[Color.Blue]: texPerSprites['units/assasin-blue/AssasinCyan-27.png'],
	[Color.Red]: texPerSprites['units/assasin-red/AssasinRed-27.png'],
	[Color.Green]: texPerSprites['units/assasin-green/AssasinLime-27.png'],
	[Color.Yellow]: texPerSprites['units/assasin-orange/AssasinOrange-27.png'],
	[Color.Purple]: texPerSprites['units/assasin-purple/AssasinPurple-27.png'],
	[Color.Evil]: texPerSprites['units/generic-soldier/generic-soldier-0.png'], // TODO
};

const gems = {
	[Color.Blue]: texPerSprites['gems/blue.png'],
	[Color.Red]: texPerSprites['gems/red.png'],
	[Color.Green]: texPerSprites['gems/green.png'],
	[Color.Yellow]: texPerSprites['gems/yellow.png'],
	[Color.Purple]: texPerSprites['gems/purple.png'],
	[Color.Evil]: texPerSprites['gems/black.png'],
};

const fires = [
	texPerSprites['fire/loop/fire1.png'],
	texPerSprites['fire/loop/fire2.png'],
	texPerSprites['fire/loop/fire3.png'],
	texPerSprites['fire/loop/fire4.png'],
	texPerSprites['fire/loop/fire5.png'],
	texPerSprites['fire/loop/fire6.png'],
	texPerSprites['fire/loop/fire7.png'],
];

function drawTile(
	attributes: Attributes,
	x1: number,
	y1: number,
	tile: FrameDataWithUV,
	tileSize: number,
	opacity: number,
) {
	const x2 = x1 + tileSize;
	const y2 = y1 + tileSize;

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
		let i = attributes.texs.nextIndex;
		for (let v of tile.uv) {
			attributes.texs.data[i++] = v;
		}
		attributes.texs.nextIndex = i;
	}
	{
		let i = attributes.alphas.nextIndex;
		attributes.alphas.data[i++] = opacity;
		attributes.alphas.data[i++] = opacity;
		attributes.alphas.data[i++] = opacity;
		attributes.alphas.data[i++] = opacity;
		attributes.alphas.data[i++] = opacity;
		attributes.alphas.data[i++] = opacity;
		attributes.alphas.nextIndex = i;
	}
}
function drawTileRow(
	attributes: Attributes,
	x: number,
	y: number,
	tile: FrameDataWithUV,
	s: number,
	num: number,
	opacity: number,
) {
	for (let i = 0; i < num; i++) {
		drawTile(attributes, x + i * s, y, tile, s, opacity);
	}
}
function drawTileCol(
	attributes: Attributes,
	x: number,
	y: number,
	tile: FrameDataWithUV,
	s: number,
	num: number,
	opacity: number,
) {
	for (let i = 0; i < num; i++) {
		drawTile(attributes, x, y + i * s, tile, s, opacity);
	}
}

function drawEmptyBottomRightCorner(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	// diagonal
	drawTile(attributes, x + s * 1, y - s * 0, sandSeaLight[0], s, opacity);
	drawTile(attributes, x + s * 2, y + s * 1, seaLightMedium[0], s, opacity);
	drawTile(attributes, x + s * 3, y + s * 2, seaMediumDeep[0], s, opacity);

	drawTileRow(attributes, x + s * 1, y - s * 1, sandGrasses[1], s, 3, opacity);
	drawTileRow(attributes, x + s * 2, y - s * 0, sandSeaLight[1], s, 2, opacity);
	drawTile(attributes, x + s * 3, y + s * 1, seaLightMedium[1], s, opacity);

	drawTileCol(attributes, x - s * 0, y - s * 0, sandGrasses[5], s, 3, opacity);
	drawTileCol(attributes, x + s * 1, y + s * 1, sandSeaLight[5], s, 2, opacity);
	drawTile(attributes, x + s * 2, y + s * 2, seaLightMedium[5], s, opacity);
}

function drawEmptyBottomLeftCorner(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	// diagonal
	drawTile(attributes, x - s * 2, y + s * 1, sandSeaLight[2], s, opacity);
	drawTile(attributes, x - s * 3, y + s * 2, seaLightMedium[2], s, opacity);
	drawTile(attributes, x - s * 4, y + s * 3, seaMediumDeep[2], s, opacity);

	drawTileRow(attributes, x - s * 4, y + s * 0, sandGrasses[1], s, 3, opacity);
	drawTileRow(attributes, x - s * 4, y + s * 1, sandSeaLight[1], s, 2, opacity);
	drawTile(attributes, x - s * 4, y + s * 2, seaLightMedium[1], s, opacity);

	drawTileCol(attributes, x - s * 1, y + s * 1, sandGrasses[7], s, 3, opacity);
	drawTileCol(attributes, x - s * 2, y + s * 2, sandSeaLight[7], s, 2, opacity);
	drawTile(attributes, x - s * 3, y + s * 3, seaLightMedium[7], s, opacity);
}

function drawEmptyTopLeftCorner(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	// diagonal
	drawTile(attributes, x - s * 3, y - s * 4, seaMediumDeep[12], s, opacity);
	drawTile(attributes, x - s * 2, y - s * 3, seaLightMedium[12], s, opacity);
	drawTile(attributes, x - s * 1, y - s * 2, sandSeaLight[12], s, opacity);

	drawTile(attributes, x - s * 2, y - s * 4, seaLightMedium[7], s, opacity);
	drawTileCol(attributes, x - s * 1, y - s * 4, sandSeaLight[7], s, 2, opacity);
	drawTileCol(attributes, x - s * 0, y - s * 4, sandGrasses[7], s, 3, opacity);

	drawTile(attributes, x - s * 3, y - s * 3, seaLightMedium[11], s, opacity);
	drawTileRow(attributes, x - s * 3, y - s * 2, sandSeaLight[11], s, 2, opacity);
	drawTileRow(attributes, x - s * 3, y - s * 1, sandGrasses[11], s, 3, opacity);
}

function drawEmptyTopRightCorner(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	// diagonal
	drawTile(attributes, x + s * 3, y - s * 4, seaMediumDeep[10], s, opacity);
	drawTile(attributes, x + s * 2, y - s * 3, seaLightMedium[10], s, opacity);
	drawTile(attributes, x + s * 1, y - s * 2, sandSeaLight[10], s, opacity);

	drawTile(attributes, x + s * 2, y - s * 4, seaLightMedium[5], s, opacity);
	drawTileCol(attributes, x + s * 1, y - s * 4, sandSeaLight[5], s, 2, opacity);
	drawTileCol(attributes, x + s * 0, y - s * 4, sandGrasses[5], s, 3, opacity);

	drawTile(attributes, x + s * 3, y - s * 3, seaLightMedium[11], s, opacity);
	drawTileRow(attributes, x + s * 2, y - s * 2, sandSeaLight[11], s, 2, opacity);
	drawTileRow(attributes, x + s * 1, y - s * 1, sandGrasses[11], s, 3, opacity);
}

function drawNorthEast000(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	drawTileRow(attributes, x - s * 3, y - s * 4, seaMediumDeep[11], s, 6, opacity);
	drawTile(attributes, x + s * 3, y - s * 4, seaMediumDeep[8], s, opacity);
	drawTileCol(attributes, x + s * 3, y - s * 3, seaMediumDeep[5], s, 6, opacity);

	drawTileRow(attributes, x - s * 3, y - s * 3, seaLightMedium[11], s, 5, opacity);
	drawTile(attributes, x + s * 2, y - s * 3, seaLightMedium[8], s, opacity);
	drawTileCol(attributes, x + s * 2, y - s * 2, seaLightMedium[5], s, 5, opacity);

	drawTileRow(attributes, x - s * 3, y - s * 2, sandSeaLight[11], s, 4, opacity);
	drawTile(attributes, x + s * 1, y - s * 2, sandSeaLight[8], s, opacity);
	drawTileCol(attributes, x + s * 1, y - s * 1, sandSeaLight[5], s, 4, opacity);

	drawTileRow(attributes, x - s * 3, y - s * 1, sandGrasses[11], s, 4, opacity);
	drawTile(attributes, x + s * 0, y - s * 1, sandGrasses[8], s, opacity);
	drawTileCol(attributes, x + s * 0, y - s * 0, sandGrasses[5], s, 4, opacity);
}

function drawNorthEast100(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	drawTileRow(attributes, x - s * 3, y - s * 1, grasses[1], s, 3, opacity); // TODO randomize

	drawTileCol(attributes, x + s * 3, y - s * 4, seaMediumDeep[5], s, 7, opacity);
	drawTileCol(attributes, x + s * 2, y - s * 4, seaLightMedium[5], s, 7, opacity);
	drawTileCol(attributes, x + s * 1, y - s * 4, sandSeaLight[5], s, 7, opacity);
	drawTileCol(attributes, x + s * 0, y - s * 4, sandGrasses[5], s, 7, opacity);
}

function drawNorthEast001(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	drawTileCol(attributes, x - s * 0, y - s * 0, grasses[1], s, 3, opacity); // TODO randomize

	drawTileRow(attributes, x - s * 3, y - s * 4, seaMediumDeep[11], s, 7, opacity);
	drawTileRow(attributes, x - s * 3, y - s * 3, seaLightMedium[11], s, 7, opacity);
	drawTileRow(attributes, x - s * 3, y - s * 2, sandSeaLight[11], s, 7, opacity);
	drawTileRow(attributes, x - s * 3, y - s * 1, sandGrasses[11], s, 7, opacity);
}

function drawNorthEast010(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	// diagonal
	drawTile(attributes, x - s * 0, y - s * 1, sandGrasses[13], s, opacity);

	drawEmptyTopLeftCorner(attributes, x, y, s, opacity);
	drawEmptyBottomRightCorner(attributes, x, y, s, opacity);
}

function drawNorthEast110(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	// diagonal
	drawTile(attributes, x - s * 0, y - s * 1, sandGrasses[0], s, opacity);

	drawEmptyBottomRightCorner(attributes, x, y, s, opacity);

	drawTileRow(attributes, x - s * 3, y - s * 1, grasses[1], s, 3, opacity); // TODO randomize
	drawTileCol(attributes, x - s * 0, y - s * 4, grasses[1], s, 3, opacity); // TODO randomize
}

function drawNorthEast011(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	// diagonal
	drawTile(attributes, x - s * 0, y - s * 1, sandGrasses[12], s, opacity);

	drawEmptyTopLeftCorner(attributes, x, y, s, opacity);

	drawTileRow(attributes, x + s * 1, y - s * 1, grasses[1], s, 3, opacity); // TODO randomize
	drawTileCol(attributes, x - s * 0, y - s * 0, grasses[1], s, 3, opacity); // TODO randomize
}

function drawNorthEast101(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	// diagonal
	drawTile(attributes, x - s * 0, y - s * 1, sandGrasses[10], s, opacity);

	drawEmptyTopRightCorner(attributes, x, y, s, opacity);

	drawTileRow(attributes, x - s * 3, y - s * 1, grasses[1], s, 3, opacity); // TODO randomize
	drawTileCol(attributes, x - s * 0, y - s * 0, grasses[1], s, 3, opacity); // TODO randomize
}

function drawNorthEast111(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	drawTileRow(attributes, x - s * 3, y - s * 1, grasses[1], s, 7, opacity); // TODO randomize
	drawTileCol(attributes, x - s * 0, y - s * 4, grasses[1], s, 3, opacity); // TODO randomize
	drawTileCol(attributes, x - s * 0, y - s * 0, grasses[1], s, 3, opacity); // TODO randomize
}

function drawSouthWest00(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	drawTileCol(attributes, x - s * 4, y - s * 3, seaMediumDeep[7], s, 6, opacity);
	drawTile(attributes, x - s * 4, y + s * 3, seaMediumDeep[4], s, opacity);
	drawTileRow(attributes, x - s * 3, y + s * 3, seaMediumDeep[1], s, 6, opacity);

	drawTileCol(attributes, x - s * 3, y - s * 3, seaLightMedium[7], s, 5, opacity);
	drawTile(attributes, x - s * 3, y + s * 2, seaLightMedium[4], s, opacity);
	drawTileRow(attributes, x - s * 2, y + s * 2, seaLightMedium[1], s, 5, opacity);

	drawTileCol(attributes, x - s * 2, y - s * 3, sandSeaLight[7], s, 4, opacity);
	drawTile(attributes, x - s * 2, y + s * 1, sandSeaLight[4], s, opacity);
	drawTileRow(attributes, x - s * 1, y + s * 1, sandSeaLight[1], s, 4, opacity);

	drawTileCol(attributes, x - s * 1, y - s * 3, sandGrasses[7], s, 3, opacity);
	drawTile(attributes, x - s * 1, y + s * 0, sandGrasses[4], s, opacity);
	drawTileRow(attributes, x - s * 0, y + s * 0, sandGrasses[1], s, 3, opacity);
}

function drawSouthWest10(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	drawTileCol(attributes, x - s * 1, y - s * 3, grasses[1], s, 3, opacity); // TODO randomize

	drawTileRow(attributes, x - s * 4, y + s * 3, seaMediumDeep[1], s, 7, opacity);
	drawTileRow(attributes, x - s * 4, y + s * 2, seaLightMedium[1], s, 7, opacity);
	drawTileRow(attributes, x - s * 4, y + s * 1, sandSeaLight[1], s, 7, opacity);
	drawTileRow(attributes, x - s * 4, y + s * 0, sandGrasses[1], s, 7, opacity);
}

function drawSouthWest01(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	drawTileRow(attributes, x - s * 0, y - s * 0, grasses[1], s, 3, opacity); // TODO randomize

	drawTileCol(attributes, x - s * 4, y - s * 3, seaMediumDeep[7], s, 7, opacity);
	drawTileCol(attributes, x - s * 3, y - s * 3, seaLightMedium[7], s, 7, opacity);
	drawTileCol(attributes, x - s * 2, y - s * 3, sandSeaLight[7], s, 7, opacity);
	drawTileCol(attributes, x - s * 1, y - s * 3, sandGrasses[7], s, 7, opacity);
}

function drawSouthWest11(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	drawTile(attributes, x - s * 1, y - s * 0, sandGrasses[2], s, opacity);
	drawEmptyBottomLeftCorner(attributes, x, y, s, opacity);

	drawTileRow(attributes, x - s * 0, y - s * 0, grasses[1], s, 3, opacity); // TODO randomize
	drawTileCol(attributes, x - s * 1, y - s * 3, grasses[1], s, 3, opacity); // TODO randomize
}

function drawSouthEast0(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	drawTileRow(attributes, x - s * 3, y + s * 3, seaMediumDeep[1], s, 6, opacity);
	drawTile(attributes, x + s * 3, y + s * 3, seaMediumDeep[3], s, opacity);
	drawTileCol(attributes, x + s * 3, y - s * 3, seaMediumDeep[5], s, 6, opacity);

	drawTileRow(attributes, x - s * 3, y + s * 2, seaLightMedium[1], s, 5, opacity);
	drawTile(attributes, x + s * 2, y + s * 2, seaLightMedium[3], s, opacity);
	drawTileCol(attributes, x + s * 2, y - s * 3, seaLightMedium[5], s, 5, opacity);

	drawTileRow(attributes, x - s * 3, y + s * 1, sandSeaLight[1], s, 4, opacity);
	drawTile(attributes, x + s * 1, y + s * 1, sandSeaLight[3], s, opacity);
	drawTileCol(attributes, x + s * 1, y - s * 3, sandSeaLight[5], s, 4, opacity);

	drawTileRow(attributes, x - s * 3, y + s * 0, sandGrasses[1], s, 3, opacity);
	drawTile(attributes, x + s * 0, y + s * 0, sandGrasses[3], s, opacity);
	drawTileCol(attributes, x + s * 0, y - s * 3, sandGrasses[5], s, 3, opacity);
}

function drawSouthEast1(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	drawTile(attributes, x - s * 0, y - s * 0, sandGrasses[14], s, opacity);
	drawEmptyBottomLeftCorner(attributes, x + s, y, s, opacity);
	drawEmptyTopRightCorner(attributes, x, y + s, s, opacity);
}

function drawNorthWest(attributes: Attributes, x: number, y: number, s: number, opacity: number) {
	drawTileCol(attributes, x - s * 4, y - s * 3, seaMediumDeep[7], s, 6, opacity);
	drawTile(attributes, x - s * 4, y - s * 4, seaMediumDeep[9], s, opacity);
	drawTileRow(attributes, x - s * 3, y - s * 4, seaMediumDeep[11], s, 6, opacity);

	drawTileCol(attributes, x - s * 3, y - s * 2, seaLightMedium[7], s, 5, opacity);
	drawTile(attributes, x - s * 3, y - s * 3, seaLightMedium[9], s, opacity);
	drawTileRow(attributes, x - s * 2, y - s * 3, seaLightMedium[11], s, 5, opacity);

	drawTileCol(attributes, x - s * 2, y - s * 1, sandSeaLight[7], s, 4, opacity);
	drawTile(attributes, x - s * 2, y - s * 2, sandSeaLight[9], s, opacity);
	drawTileRow(attributes, x - s * 1, y - s * 2, sandSeaLight[11], s, 4, opacity);

	drawTileCol(attributes, x - s * 1, y - s * 0, sandGrasses[7], s, 3, opacity);
	drawTile(attributes, x - s * 1, y - s * 1, sandGrasses[9], s, opacity);
	drawTileRow(attributes, x - s * 0, y - s * 1, sandGrasses[11], s, 3, opacity);
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

export type Attributes = {
	positions: {data: Float32Array; nextIndex: number};
	texs: {data: Float32Array; nextIndex: number};
	alphas: {data: Float32Array; nextIndex: number};
};

export function drawCorners(
	attributes: Attributes,
	cellSize: number,
	offset: number,
	neighbors: Neighbors,
	tileSize: number,
	x: number,
	y: number,
	opacity: number,
) {
	if (!neighbors.N && !neighbors.NE && !neighbors.E) {
		drawNorthEast000(attributes, x - offset + cellSize, y + offset, tileSize, opacity);
	} else if (neighbors.N && !neighbors.NE && !neighbors.E) {
		drawNorthEast100(attributes, x - offset + cellSize, y + offset, tileSize, opacity);
	} else if (!neighbors.N && !neighbors.NE && neighbors.E) {
		drawNorthEast001(attributes, x - offset + cellSize, y + offset, tileSize, opacity);
	} else if (!neighbors.N && neighbors.NE && !neighbors.E) {
		drawNorthEast010(attributes, x - offset + cellSize, y + offset, tileSize, opacity);
	} else if (neighbors.N && neighbors.NE && !neighbors.E) {
		drawNorthEast110(attributes, x - offset + cellSize, y + offset, tileSize, opacity);
	} else if (!neighbors.N && neighbors.NE && neighbors.E) {
		drawNorthEast011(attributes, x - offset + cellSize, y + offset, tileSize, opacity);
	} else if (neighbors.N && !neighbors.NE && neighbors.E) {
		drawNorthEast101(attributes, x - offset + cellSize, y + offset, tileSize, opacity);
	} else {
		drawNorthEast111(attributes, x - offset + cellSize, y + offset, tileSize, opacity);
	}

	if (!neighbors.SW) {
		if (!neighbors.W && !neighbors.S) {
			drawSouthWest00(attributes, x + offset, y - offset + cellSize, tileSize, opacity);
		} else if (neighbors.W && !neighbors.S) {
			drawSouthWest10(attributes, x + offset, y - offset + cellSize, tileSize, opacity);
		} else if (!neighbors.W && neighbors.S) {
			drawSouthWest01(attributes, x + offset, y - offset + cellSize, tileSize, opacity);
		} else {
			drawSouthWest11(attributes, x + offset, y - offset + cellSize, tileSize, opacity);
		}
	}

	if (!neighbors.S && !neighbors.E) {
		if (!neighbors.SE) {
			drawSouthEast0(attributes, x - offset + cellSize, y - offset + cellSize, tileSize, opacity);
		} else {
			drawSouthEast1(attributes, x - offset + cellSize, y - offset + cellSize, tileSize, opacity);
		}
	}

	if (!neighbors.W && !neighbors.N && !neighbors.NW) {
		drawNorthWest(attributes, x + offset, y + offset, tileSize, opacity);
	}
}

export function drawGrassCenter(
	attributes: Attributes,
	cellSize: number,
	offset: number,
	tileSize: number,
	numTiles: number,
	x: number,
	y: number,
	opacity: number,
) {
	for (let cy = 0; cy < numTiles; cy++) {
		for (let cx = 0; cx < numTiles; cx++) {
			const x1 = offset + x * cellSize + cx * tileSize;
			const x2 = x1 + tileSize;
			const y1 = offset + y * cellSize + cy * tileSize;
			const y2 = y1 + tileSize;

			{
				//attributes.positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
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
				const uv = grasses[(cx + cy) % 8].uv;
				let i = attributes.texs.nextIndex;
				for (let v of uv) {
					attributes.texs.data[i++] = v;
				}
				attributes.texs.nextIndex = i;
			}
			{
				let i = attributes.alphas.nextIndex;
				attributes.alphas.data[i++] = opacity;
				attributes.alphas.data[i++] = opacity;
				attributes.alphas.data[i++] = opacity;
				attributes.alphas.data[i++] = opacity;
				attributes.alphas.data[i++] = opacity;
				attributes.alphas.data[i++] = opacity;
				attributes.alphas.nextIndex = i;
			}
		}
	}
}

export function drawSandCenter(
	attributes: Attributes,
	cellSize: number,
	offset: number,
	tileSize: number,
	numTiles: number,
	x: number,
	y: number,
	opacity: number,
) {
	// for (let cy = 0; cy < numTiles; cy++) {
	// 	for (let cx = 0; cx < numTiles; cx++) {
	// 		const x1 = offset + x * cellSize + cx * tileSize;
	// 		const x2 = x1 + tileSize;
	// 		const y1 = offset + y * cellSize + cy * tileSize;
	// 		const y2 = y1 + tileSize;

	// 		attributes.positions.push(x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2);
	// 		attributes.texs.push(...sandGrasses[6].uv);
	// 		attributes.alphas.push(opacity, opacity, opacity, opacity, opacity, opacity); // TODO
	// 	}
	// }
	const x1 = offset + x * cellSize;
	const y1 = offset + y * cellSize;
	drawTile(attributes, x1, y1, sandGrasses[0], tileSize, opacity);
	drawTileRow(attributes, x1 + tileSize * 1, y1, sandGrasses[1], tileSize, 4, opacity);
	drawTile(attributes, x1 + tileSize * 5, y1, sandGrasses[2], tileSize, opacity);
	drawTileCol(attributes, x1 + tileSize * 5, y1 + tileSize * 1, sandGrasses[7], tileSize, 4, opacity);
	drawTile(attributes, x1 + tileSize * 5, y1 + tileSize * 5, sandGrasses[12], tileSize, opacity);
	drawTileRow(attributes, x1 + tileSize * 1, y1 + tileSize * 5, sandGrasses[11], tileSize, 4, opacity);
	drawTile(attributes, x1, y1 + tileSize * 5, sandGrasses[10], tileSize, opacity);
	drawTileCol(attributes, x1, y1 + tileSize * 1, sandGrasses[5], tileSize, 4, opacity);

	drawTileRow(attributes, x1 + tileSize * 1, y1 + tileSize * 1, sandGrasses[6], tileSize, 4, opacity);
	drawTileRow(attributes, x1 + tileSize * 1, y1 + tileSize * 2, sandGrasses[6], tileSize, 4, opacity);
	drawTileRow(attributes, x1 + tileSize * 1, y1 + tileSize * 3, sandGrasses[6], tileSize, 4, opacity);
	drawTileRow(attributes, x1 + tileSize * 1, y1 + tileSize * 4, sandGrasses[6], tileSize, 4, opacity);
}

function getXYFromIndex(cellSize: number, tileSize: number, index: number) {
	if (index === 0) {
		return {
			dx: -tileSize,
			dy: -tileSize,
		};
	} else if (index === 1) {
		return {
			dx: tileSize * 2,
			dy: -tileSize,
		};
	} else if (index === 2) {
		return {
			dx: -tileSize,
			dy: tileSize * 2,
		};
	} else if (index === 3) {
		return {
			dx: tileSize * 2,
			dy: tileSize * 2,
		};
	} else if (index === 4) {
		return {
			dx: -tileSize * 2,
			dy: 0,
		};
	} else if (index === 5) {
		return {
			dx: tileSize * 3,
			dy: tileSize * 1,
		};
	} else if (index === 6) {
		return {
			dx: 0,
			dy: -tileSize * 2,
		};
	} else if (index === 7) {
		return {
			dx: tileSize * 1,
			dy: tileSize * 3,
		};
	}
	return {
		dx: 0,
		dy: 0,
	};
}

export function drawHouse(
	attributes: Attributes,
	cellSize: number,
	tileSize: number,
	x: number,
	y: number,
	color: Color,
	opacity: number,
	index: number,
) {
	if (color === Color.None) {
		return;
	}
	const {dx, dy} = getXYFromIndex(cellSize, tileSize, index);
	drawTile(
		attributes,
		x + cellSize / 2 - tileSize + dx,
		y + cellSize / 2 - tileSize + dy,
		houses[color],
		tileSize,
		opacity,
	);
}

export function drawHouseInFire(
	attributes: Attributes,
	cellSize: number,
	tileSize: number,
	x: number,
	y: number,
	color: Color,
	opacity: number,
	index: number,
) {
	if (color === Color.None) {
		return;
	}
	drawHouse(attributes, cellSize, tileSize, x, y, color, opacity, index);
	const {dx, dy} = getXYFromIndex(cellSize, tileSize, index);
	drawFire(
		attributes,
		tileSize,
		x + cellSize / 2 - tileSize + dx,
		y + cellSize / 2 - tileSize + dy - tileSize / 2,
		opacity,
	);
}

export function drawFire(attributes: Attributes, tileSize: number, x: number, y: number, opacity: number) {
	drawTile(attributes, x, y, fires[0], tileSize, opacity);
}

export function drawTent(
	attributes: Attributes,
	cellSize: number,
	tileSize: number,
	x: number,
	y: number,
	color: Color,
	opacity: number,
	index: number,
) {
	if (color === Color.None) {
		return;
	}
	const {dx, dy} = getXYFromIndex(cellSize, tileSize, index);
	drawTile(
		attributes,
		x + cellSize / 2 - tileSize + dx,
		y + cellSize / 2 - tileSize + dy,
		tents[color],
		tileSize,
		opacity,
	);
}

export function drawGem(
	attributes: Attributes,
	cellSize: number,
	tileSize: number,
	x: number,
	y: number,
	color: Color,
	opacity: number,
) {
	if (color === Color.None) {
		return;
	}
	drawTile(
		attributes,
		x + cellSize / 2 - tileSize,
		y + cellSize / 2 - tileSize - tileSize,
		gems[color],
		tileSize * 2,
		opacity,
	);
}

export function drawCastle(
	attributes: Attributes,
	cellSize: number,
	tileSize: number,
	x: number,
	y: number,
	color: Color,
	opacity: number,
) {
	if (color === Color.None) {
		return;
	}
	drawTile(
		attributes,
		x + cellSize / 2 - tileSize,
		y + cellSize / 2 - tileSize + tileSize / 3,
		castles[color],
		tileSize * 2,
		opacity,
	);
}

export function drawUnit(
	attributes: Attributes,
	cellSize: number,
	tileSize: number,
	x: number,
	y: number,
	color: Color,
	opacity: number,
	dx: number,
	dy: number,
) {
	if (color === Color.None) {
		return;
	}
	drawTile(
		attributes,
		x + cellSize / 2 + tileSize * dx * 3 - tileSize / 2 + tileSize / 3,
		y + cellSize / 2 + tileSize * dy * 3,
		soldiers[color],
		tileSize,
		opacity,
	);
}
