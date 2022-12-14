import type {CellColor} from 'stratagems-indexer';
import {writable, type Subscriber, type Unsubscriber, type Writable} from 'sveltore';

export type LocalMove = {
	player: string;
	color: CellColor;
	x: number;
	y: number;
};

export type LocalMoves = LocalMove[];

export class ActionState {
	store: Writable<LocalMoves>;
	$store: LocalMoves;

	constructor() {
		this.$store = [];
		this.store = writable(this.$store);
	}

	subscribe(run: Subscriber<LocalMoves>, invalidate?: (value?: LocalMoves) => void): Unsubscriber {
		return this.store.subscribe(run, invalidate);
	}

	addMove(move: LocalMove) {
		const existingMove = this.$store.find((v) => v.x === move.x && v.y === move.y);
		if (!existingMove) {
			this.$store.push(move);
		} else {
			existingMove.color = move.color;
		}

		this.store.set(this.$store);
	}

	removeMove(x: number, y: number) {
		for (let i = 0; i < this.$store.length; i++) {
			const move = this.$store[i];
			if (move.x === x && move.y === y) {
				this.$store.splice(i, 1);
				i--;
			}
		}
		this.store.set(this.$store);
	}

	clear() {
		this.$store = [];
		this.store.set(this.$store);
	}
}

export const actionState = new ActionState();
