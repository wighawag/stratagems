import type {Attributes} from './programs/Textured2D';

export type Frame = {x: number; y: number; w: number; h: number};
export type FrameData = {
	frame: Frame;
	rotated: boolean;
	trimmed: boolean;
	spriteSourceSize: Frame;
	sourceSize: {w: number; h: number};
};

export type FrameDataWithUV = FrameData & {uvFrame: Frame; uv: number[]; uvs: number[][]};

export function drawTileX2y2(
	attributes: Attributes,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	tile: FrameDataWithUV,
	opacity: number,
	uvIndex: number = 0,
) {
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
		let uvs = tile.uv;
		if (uvIndex > 0) {
			uvs = tile.uvs[uvIndex];
		}

		for (let v of uvs) {
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
export function drawTile(
	attributes: Attributes,
	x1: number,
	y1: number,
	tile: FrameDataWithUV,
	width: number,
	height: number,
	opacity: number,
	uvIndex: number = 0,
) {
	const x2 = x1 + width;
	const y2 = y1 + height;

	drawTileX2y2(attributes, x1, y1, x2, y2, tile, opacity, uvIndex);
}
export function drawTileRow(
	attributes: Attributes,
	x: number,
	y: number,
	tile: FrameDataWithUV,
	width: number,
	height: number,
	num: number,
	opacity: number,
	uvIndex: number = 0,
) {
	for (let i = 0; i < num; i++) {
		drawTile(attributes, x, y, tile, width, height, opacity, uvIndex);
		x += width;
	}
}
export function drawTileCol(
	attributes: Attributes,
	x: number,
	y: number,
	tile: FrameDataWithUV,
	width: number,
	height: number,
	num: number,
	opacity: number,
	uvIndex: number = 0,
) {
	for (let i = 0; i < num; i++) {
		drawTile(attributes, x, y, tile, width, height, opacity, uvIndex);
		y += height;
	}
}
