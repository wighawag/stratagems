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

	update(state: ViewData) {
		const unseen = new Map(this.elements);
		for (const cellID of Object.keys(state.cells)) {
			const element = this.getOrAddElement(cellID, state.cells[cellID]);
			unseen.delete(cellID);
		}
		for (const elem of unseen.entries()) {
			this.viewport.removeChild(elem[1]);
			this.elements.delete(elem[0]);
		}
	}
}
