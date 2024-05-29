import type {StratagemsViewState} from '$lib/state/ViewState';
import type {CameraState} from '../camera';
import {Textured2DProgram, type Attributes} from '../programs/Textured2D';
import * as twgl from 'twgl.js';
import * as m3 from '$utils/m3';
import sheetURL from '$data/assets/sheet.png';
import sheet from '$data/assets/sheet.json';
import {Color, xyToBigIntID} from 'stratagems-common';
import {drawTile, drawTileCol, drawTileRow, drawTileX2y2, type FrameDataWithUV} from '../tiles';

type SheetData = typeof sheet;

type TextureData = {
	[Property in keyof SheetData['frames']]: FrameDataWithUV;
};

const size = sheet.meta.size;
function uvs(value: FrameDataWithUV, factor: number) {
	factor = Math.min(Math.max(factor, 1), Math.max(value.frame.h, value.frame.w));
	const wFactor = Math.min(factor, value.frame.w);
	const hFactor = Math.min(factor, value.frame.h);
	const x = (value.frame.x + wFactor * 0.5) / size.w;
	const y = (value.frame.y + hFactor * 0.5) / size.h;
	const w = Math.max(value.frame.w - wFactor, 1) / size.w;
	const h = Math.max(value.frame.h - hFactor, 1) / size.h;
	const x1 = x;
	const x2 = x + w;
	const y1 = y;
	const y2 = y + h;
	return [x1, y1, x2, y1, x1, y2, x1, y2, x2, y1, x2, y2];
}

const texPerSprites: TextureData = sheet.frames as any;
for (const key of Object.keys(texPerSprites)) {
	const value = (texPerSprites as any)[key] as FrameDataWithUV;
	const x = (value.frame.x + 0.5) / size.w;
	const y = (value.frame.y + 0.5) / size.h;
	const w = (value.frame.w - 1) / size.w;
	const h = (value.frame.h - 1) / size.h;
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
	value.uvs = [uvs(value, 1), uvs(value, 2), uvs(value, 4), uvs(value, 8), uvs(value, 16)];
}

type TerrainRenderData = {
	tl: FrameDataWithUV;
	tr: FrameDataWithUV;
	bl: FrameDataWithUV;
	br: FrameDataWithUV;
	cc: FrameDataWithUV;
	cr: FrameDataWithUV;
	cl: FrameDataWithUV;
	tc: FrameDataWithUV;
	bc: FrameDataWithUV;
	life: FrameDataWithUV;
};

const terrains: TerrainRenderData[] = [];
for (const terrain of ['forest', 'desert', 'swamp', 'taiga', 'tundra', 'cave']) {
	terrains.push({
		tl: (texPerSprites as any)[`${terrain}/tl_00.png`],
		tr: (texPerSprites as any)[`${terrain}/tr_00.png`],
		bl: (texPerSprites as any)[`${terrain}/bl_00.png`],
		br: (texPerSprites as any)[`${terrain}/br_00.png`],
		cc: (texPerSprites as any)[`${terrain}/cc_00.png`],
		cr: (texPerSprites as any)[`${terrain}/cr_00.png`],
		cl: (texPerSprites as any)[`${terrain}/cl_00.png`],
		tc: (texPerSprites as any)[`${terrain}/tc_00.png`],
		bc: (texPerSprites as any)[`${terrain}/bc_00.png`],
		life: (texPerSprites as any)[`${terrain}/life.png`],
	});
}

const eth = texPerSprites['eth.png'];
const newLife = texPerSprites['new-life.png'];
const deadLife = texPerSprites['dead-life.png'];
const emptyBig = texPerSprites[`empty/big_rock.png`];
const emptySmall = texPerSprites[`empty/small_rock.png`];
const emptyFull = texPerSprites[`empty/full-tile.png`];

export class TerrainLayer extends Textured2DProgram {
	constructor(size: number) {
		super(size);
	}

	initialize(GL: WebGL2RenderingContext): void {
		super.initialize(GL);
		this.textures = twgl.createTextures(GL, {
			sheet: {src: sheetURL, mag: GL.NEAREST},
		});
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
			u_tex: this.textures['sheet'],
		};

		const numTiles = 17;
		const tileSize = this.size / numTiles;

		const factor = 324 / cameraState.renderScale;
		let uvIndex = 0;
		if (factor >= 32) {
			uvIndex = 4;
		} else if (factor > 5) {
			uvIndex = 3;
		} else if (factor > 2) {
			uvIndex = 2;
		} else if (factor > 1) {
			uvIndex = 1;
		}

		this.attributes.positions.nextIndex = 0;
		this.attributes.texs.nextIndex = 0;
		this.attributes.alphas.nextIndex = 0;
		for (let cellPos of Object.keys(state.cells)) {
			const cell = state.viewCells[cellPos];
			const [x, y] = cellPos.split(',').map((v) => parseInt(v));
			const terrain = terrains[cell.next.color - 1];

			if (cell.next.color === Color.None) {
				// for (let iy = 0; iy < 6; iy++) {
				//     for (let ix = 0; ix < 6; ix++) {
				//         drawTile(this.attributes, x +ix  * tileSize *3, y + iy * tileSize *3 , emptyBig, tileSize * 2, 1);
				//     }
				// }
				drawTile(this.attributes, x, y, emptyFull, this.size, this.size, 1, uvIndex);
			} else {
				// draw tiles
				drawTile(this.attributes, x, y, terrain.tl, tileSize, tileSize, 1, uvIndex);
				drawTileRow(this.attributes, x + tileSize, y, terrain.tc, tileSize, tileSize, 15, 1, uvIndex);

				drawTile(this.attributes, x + this.size - tileSize, y, terrain.tr, tileSize, tileSize, 1, uvIndex);
				drawTileCol(
					this.attributes,
					x + this.size - tileSize,
					y + tileSize,
					terrain.cr,
					tileSize,
					tileSize,
					15,
					1,
					uvIndex,
				);

				drawTile(
					this.attributes,
					x + this.size - tileSize,
					y + this.size - tileSize,
					terrain.br,
					tileSize,
					tileSize,
					1,
					uvIndex,
				);
				drawTileRow(
					this.attributes,
					x + tileSize,
					y + this.size - tileSize,
					terrain.bc,
					tileSize,
					tileSize,
					15,
					1,
					uvIndex,
				);

				drawTile(this.attributes, x, y + this.size - tileSize, terrain.bl, tileSize, tileSize, 1, uvIndex);
				drawTileCol(this.attributes, x, y + tileSize, terrain.cl, tileSize, tileSize, 15, 1, uvIndex);

				for (let iy = 0; iy < 15; iy++) {
					drawTileRow(
						this.attributes,
						x + tileSize,
						y + (1 + iy) * tileSize,
						terrain.cc,
						tileSize,
						tileSize,
						15,
						1,
						uvIndex,
					);
				}
			}
		}

		function drawOneLife(attributes: Attributes, x: number, y: number, lifeTile: FrameDataWithUV) {
			drawTile(attributes, x, y, lifeTile, tileSize, tileSize * 2, 1);
			drawTile(attributes, x + tileSize * 2, y, lifeTile, tileSize, tileSize * 2, 1);
			drawTile(attributes, x + tileSize * 1, y + tileSize * 1, lifeTile, tileSize, tileSize * 2, 1);
		}
		const lifeX = (x: number, i: number) => {
			if (i == 0) {
				return x + tileSize;
			} else if (i == 1) {
				return x + this.size - tileSize * 4;
			} else if (i == 2) {
				return x + tileSize;
			} else if (i == 3) {
				return x + this.size - tileSize * 4;
			} else if (i == 4) {
				return x + this.size / 2 - tileSize * 2;
			} else if (i == 5) {
				return x + tileSize;
			} else if (i == 6) {
				return x + this.size - tileSize * 4;
			}
			return x;
		};
		const lifeY = (y: number, i: number) => {
			if (i == 0) {
				return y + tileSize;
			} else if (i == 1) {
				return y + tileSize;
			} else if (i == 2) {
				return y + this.size - tileSize * 4;
			} else if (i == 3) {
				return y + this.size - tileSize * 4;
			} else if (i == 4) {
				return y + tileSize;
			} else if (i == 5) {
				return y + this.size / 2 - tileSize * 2;
			} else if (i == 6) {
				return y + this.size / 2 - tileSize * 2;
			}
			return y;
		};

		for (let cellPos of Object.keys(state.cells)) {
			const cell = state.viewCells[cellPos];
			const contractCell = state.cells[cellPos];
			const [x, y] = cellPos.split(',').map((v) => parseInt(v));
			const terrain = terrains[cell.next.color - 1];

			for (let i = 0; i < cell.next.life; i++) {
				drawOneLife(this.attributes, lifeX(x, i), lifeY(y, i), terrain.life);
			}

			if (cell.next.life > 0) {
				if (contractCell.stake > 1) {
					for (let i = 0; i < contractCell.stake; i++) {
						const gap = tileSize;
						const start = x + this.size / 2 - (contractCell.stake / 2) * gap;
						drawTile(this.attributes, start + gap * i, y + this.size / 2 - tileSize, eth, tileSize, tileSize * 2, 1);
					}
				} else {
					drawTile(
						this.attributes,
						x + this.size / 2 - tileSize,
						y + this.size / 2 - tileSize,
						eth,
						tileSize,
						tileSize * 2,
						1,
					);
				}
			}

			if (cell.future.life > cell.next.life) {
				for (let i = cell.next.life; i < cell.future.life; i++) {
					drawOneLife(this.attributes, lifeX(x, i), lifeY(y, i), newLife);
				}
			} else if (cell.future.life < cell.next.life) {
				for (let i = Math.max(0, cell.next.life - (cell.next.life - cell.future.life)); i < cell.next.life; i++) {
					const offset = 0.2 * tileSize;
					const margin = 0.3 * tileSize;
					drawOneLife(this.attributes, lifeX(x, i), lifeY(y, i), deadLife);
				}
			}
		}

		// we update the buffer with the new arrays
		twgl.setAttribInfoBufferFromArray(GL, this.bufferInfo.attribs!.a_position, this.attributes.positions);
		twgl.setAttribInfoBufferFromArray(GL, this.bufferInfo.attribs!.a_tex, this.attributes.texs);
		twgl.setAttribInfoBufferFromArray(GL, this.bufferInfo.attribs!.a_alpha, this.attributes.alphas);
		// we need to tell twgl the number of element to draw
		// see : https://github.com/greggman/twgl.js/issues/211
		this.bufferInfo.numElements = this.attributes.positions.nextIndex / 2;

		(window as any).attributes = this.attributes;
		// we draw
		twgl.setBuffersAndAttributes(GL, this.programInfo, this.bufferInfo);
		twgl.setUniforms(this.programInfo, uniforms);
		twgl.drawBufferInfo(GL, this.bufferInfo, GL.TRIANGLES);
	}
}
