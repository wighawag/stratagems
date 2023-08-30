import type {ViewCell, ViewCellData, ViewData} from '$lib/state/ViewState';
import type {DisplayObject} from 'pixi.js';
import {Container, Sprite, Texture} from 'pixi.js';
import type {Viewport} from 'pixi-viewport';
import {COLORS} from './colors';

export class PIXIState {
	protected elements: Map<string, Container>;
	protected counter: number;
	constructor(protected viewport: Viewport) {
		this.elements = new Map();
		this.counter = 0;
	}

	protected getOrAddElement(cellID: string, cell: ViewCell): Container {
		let elem = this.elements.get(cellID);
		if (!elem) {
			// const {x, y} = bigIntIDToXY(BigInt(cellID));
			const [x, y] = cellID.split(',').map((v) => parseInt(v, 10));
			elem = this.viewport.addChild(new Container());
			elem.width = elem.height = 1;
			elem.position.set(x, y);
			this.elements.set(cellID, elem);
		}
		return elem;
	}

	upateCell(cellID: string, cell: ViewCellData, element: DisplayObject) {
		const elem = element as Sprite & {last: {nextLife: number; futureLife: number; currentPlayer: boolean}};
		if (
			!elem.last ||
			elem.last.nextLife !== cell.next.life ||
			elem.last.futureLife !== cell.future.life ||
			elem.last.currentPlayer !== cell.currentPlayer
		) {
			elem.removeChildren();

			if (cell.currentPlayer) {
				const sprite = elem.addChild(new Sprite(Texture.WHITE));
				sprite.tint = '#00ff00';
				sprite.width = sprite.height = 1;
			}

			const sprite = elem.addChild(new Sprite(Texture.WHITE));
			sprite.tint = COLORS[cell.next.color];
			sprite.x = 0.08;
			sprite.y = 0.08;
			sprite.width = sprite.height = 0.84;

			for (let i = 0; i < cell.next.life; i++) {
				const child = sprite.addChild(new Sprite(Texture.WHITE));
				const offset = 0.2 * Texture.WHITE.width;
				const margin = 0.3 * Texture.WHITE.width;
				child.tint = 0x000000;
				child.width = child.height = Texture.WHITE.width / 5;
				child.position.set(offset + margin * (i % 3), offset + margin * Math.floor(i / 3));
			}
			if (cell.future.life > cell.next.life) {
				for (let i = cell.next.life; i < cell.future.life; i++) {
					const child = sprite.addChild(new Sprite(Texture.WHITE));
					const offset = 0.2 * Texture.WHITE.width;
					const margin = 0.3 * Texture.WHITE.width;
					child.tint = 0x00ff00;
					child.width = child.height = Texture.WHITE.width / 5;
					child.position.set(offset + margin * (i % 3), offset + margin * Math.floor(i / 3));
				}
			} else if (cell.future.life < cell.next.life) {
				for (let i = Math.max(0, cell.next.life - (cell.next.life - cell.future.life)); i < cell.next.life; i++) {
					const child = sprite.addChild(new Sprite(Texture.WHITE));
					const offset = 0.2 * Texture.WHITE.width;
					const margin = 0.3 * Texture.WHITE.width;
					child.tint = 0xff0000;
					child.width = child.height = Texture.WHITE.width / 5;
					child.position.set(offset + margin * (i % 3), offset + margin * Math.floor(i / 3));
				}
			}

			elem.last = {
				nextLife: cell.next.life,
				futureLife: cell.future.life,
				currentPlayer: cell.currentPlayer,
			};
		}
	}

	update(state: ViewData) {
		const unseen = new Map(this.elements);
		for (const cellID of Object.keys(state.cells)) {
			const cell = state.cells[cellID];
			const element = this.getOrAddElement(cellID, cell.next);
			this.upateCell(cellID, cell, element);
			unseen.delete(cellID);
		}
		for (const elem of unseen.entries()) {
			this.viewport.removeChild(elem[1]);
			this.elements.delete(elem[0]);
		}
	}
}
