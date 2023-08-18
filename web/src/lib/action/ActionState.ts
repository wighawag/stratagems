import {xyToBigIntID, type Color, type ContractMove} from 'stratagems-common';
import {writable, type Subscriber, type Unsubscriber, type Writable} from 'svelte/store';

export type LocalMove = {
	player: string;
	color: Color;
	x: number;
	y: number;
};

export type LocalMoves = LocalMove[];

export function localMoveToContractMove(localMove: LocalMove): ContractMove {
	return {
		color: localMove.color,
		position: xyToBigIntID(localMove.x, localMove.y),
	};
}

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
		console.log('clearing....');
		this.$store = [];
		this.store.set(this.$store);
	}
}

export const actionState = new ActionState();
