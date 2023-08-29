import type {ViewCell, ViewData} from '$lib/state/ViewState';
import type {DisplayObject} from 'pixi.js';
import {Sprite, Texture} from 'pixi.js';
import type {Viewport} from 'pixi-viewport';
import {bigIntIDToXY} from 'stratagems-common';
import {COLORS} from './colors';

export class PIXIState {
	protected elements: Map<string, DisplayObject>;
	protected counter: number;
	constructor(protected viewport: Viewport) {
		this.elements = new Map();
		this.counter = 0;
	}

	protected getOrAddElement(cellID: string, cell: ViewCell): DisplayObject {
		let elem = this.elements.get(cellID);
		if (!elem) {
			// const {x, y} = bigIntIDToXY(BigInt(cellID));
			const [x, y] = cellID.split(',').map((v) => parseInt(v, 10));
			const sprite = this.viewport.addChild(new Sprite(Texture.WHITE));
			sprite.tint = COLORS[cell.color];
			sprite.width = sprite.height = 1;
			sprite.position.set(x, y);
			elem = sprite;
			this.elements.set(cellID, elem);
		}
		return elem;
	}

	upateCell(cellID: string, cell: ViewCell, future: ViewCell, element: DisplayObject) {
		const sprite = element as Sprite & {last: {nextLife: number; futureLife: number}};
		if (!sprite.last || sprite.last.nextLife !== cell.life || sprite.last.futureLife !== future.life) {
			sprite.removeChildren();
			for (let i = 0; i < cell.life; i++) {
				const child = sprite.addChild(new Sprite(Texture.WHITE));
				const offset = 0.2 * Texture.WHITE.width;
				const margin = 0.3 * Texture.WHITE.width;
				child.tint = 0x000000;
				child.width = child.height = Texture.WHITE.width / 5;
				child.position.set(offset + margin * (i % 3), offset + margin * Math.floor(i / 3));
			}
			if (future.life > cell.life) {
				for (let i = cell.life; i < future.life; i++) {
					const child = sprite.addChild(new Sprite(Texture.WHITE));
					const offset = 0.2 * Texture.WHITE.width;
					const margin = 0.3 * Texture.WHITE.width;
					child.tint = 0x00ff00;
					child.width = child.height = Texture.WHITE.width / 5;
					child.position.set(offset + margin * (i % 3), offset + margin * Math.floor(i / 3));
				}
			} else if (future.life < cell.life) {
				for (let i = cell.life - (cell.life - future.life); i < cell.life; i++) {
					const child = sprite.addChild(new Sprite(Texture.WHITE));
					const offset = 0.2 * Texture.WHITE.width;
					const margin = 0.3 * Texture.WHITE.width;
					child.tint = 0xff0000;
					child.width = child.height = Texture.WHITE.width / 5;
					child.position.set(offset + margin * (i % 3), offset + margin * Math.floor(i / 3));
				}
			}

			sprite.last = {
				nextLife: cell.life,
				futureLife: future.life,
			};
		}
	}

	update(state: ViewData) {
		const unseen = new Map(this.elements);
		for (const cellID of Object.keys(state.cells)) {
			const cell = state.cells[cellID];
			const element = this.getOrAddElement(cellID, cell.next);
			this.upateCell(cellID, cell.next, cell.future, element);
			unseen.delete(cellID);
		}
		for (const elem of unseen.entries()) {
			this.viewport.removeChild(elem[1]);
			this.elements.delete(elem[0]);
		}
	}
}
