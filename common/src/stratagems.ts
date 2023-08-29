import {zeroAddress} from 'viem';
import {ContractSimpleCell} from './grid';

export type ContractMove = {position: bigint; color: Color};

export function bigIntIDToXYID(position: bigint): string {
	const {x, y} = bigIntIDToXY(position);
	return '' + x + ',' + y;
}

export type CellXYPosition = {
	x: number;
	y: number;
};

// using 64 bits room id
// const leftMostBit = BigInt('0x8000000000000000');
// const bn32 = BigInt('0x10000000000000000');
export function bigIntIDToXY(position: bigint): CellXYPosition {
	const bn = BigInt(position);
	const x = Number(BigInt.asIntN(32, bn));
	const y = Number(BigInt.asIntN(32, bn >> 32n));
	// const rx = x >= leftMostBit ? -(bn32 - x) : x;
	// const ry = y >= leftMostBit ? -(bn32 - y) : y;
	return {x, y};
}

export type CellBigIntXYPosition = {
	x: bigint;
	y: bigint;
};

export function bigIntIDToBigintXY(position: bigint): CellBigIntXYPosition {
	const bn = BigInt(position);
	const x = BigInt.asIntN(32, bn);
	const y = BigInt.asIntN(32, bn >> 32n);
	return {x, y};
}

export function xyToXYID(x: number, y: number) {
	return '' + x + ',' + y;
}

export function xyToBigIntID(x: number, y: number): bigint {
	// const bn = (BigInt.asUintN(32, BigInt(x)) + BigInt.asUintN(32, BigInt(y))) << 32n;
	const bn = (x < 0 ? 2n ** 32n + BigInt(x) : BigInt(x)) + ((y < 0 ? 2n ** 32n + BigInt(y) : BigInt(y)) << 32n);
	return bn;
}

export enum Color {
	None = 0,
	Blue = 1,
	Red = 2,
	Green = 3,
	Yellow = 4,
	Purple = 5,
	Evil = 6,
}

export type ContractCell = {
	lastEpochUpdate: number;
	epochWhenTokenIsAdded: number;
	color: number;
	life: number;
	delta: number;
	enemymask: number;
};

export type ContractFullCell = ContractCell & {
	owner: `0x${string}`;
};

export class StratagemsContract {
	constructor(
		private state: {cells: {[position: string]: ContractCell}; owners: {[poistion: string]: `0x${string}`}},
		public MAX_LIFE: number,
	) {}

	computeNewLife(
		lastUpdate: number,
		enemymask: number,
		delta: number,
		life: number,
		epoch: number,
	): {newLife: number; epochUsed: number} {
		const MAX_LIFE = this.MAX_LIFE;

		const data = {
			newLife: life,
			epochUsed: epoch,
		};
		if (lastUpdate >= 1 && life > 0) {
			let epochDelta = epoch - lastUpdate;
			if (epochDelta > 0) {
				let effectiveDelta = delta != 0 ? delta : -1;
				if (effectiveDelta < 0 && enemymask == 0) {
					effectiveDelta = 0;
				}
				if (effectiveDelta > 0) {
					if (life < MAX_LIFE) {
						const maxEpoch = MAX_LIFE - life + Math.floor(effectiveDelta - 1) / effectiveDelta;
						if (epochDelta > maxEpoch) {
							epochDelta = maxEpoch;
						}

						life += epochDelta * effectiveDelta;
						if (life > MAX_LIFE) {
							life = MAX_LIFE;
						}
						data.newLife = life;
						data.epochUsed = lastUpdate + epochDelta;
					} else {
						data.newLife = life;
						data.epochUsed = lastUpdate;
					}
				} else if (effectiveDelta < 0) {
					const numEpochBeforeDying = life + Math.floor(-effectiveDelta - 1) / -effectiveDelta;
					if (epochDelta > numEpochBeforeDying) {
						epochDelta = numEpochBeforeDying;
					}
					const lifeLoss = epochDelta * -effectiveDelta;
					if (lifeLoss > life) {
						data.newLife = 0;
					} else {
						data.newLife = life - lifeLoss;
					}
					data.epochUsed = lastUpdate + epochDelta;
				} else {
					data.newLife = life;
					data.epochUsed = lastUpdate;
				}
			} else {
				data.newLife = life;
				data.epochUsed = lastUpdate;
			}
		}

		return data;
	}

	getCellInMemory(position: bigint): ContractCell {
		const cell: ContractCell | null = this.state.cells[position.toString()];
		return {
			lastEpochUpdate: cell?.lastEpochUpdate || 0,
			color: cell?.color || Color.None,
			delta: cell?.delta || 0,
			enemymask: cell?.enemymask || 0,
			epochWhenTokenIsAdded: cell?.epochWhenTokenIsAdded || 0,
			life: cell?.life || 0,
		};
	}

	getUpdatedCell(position: bigint, epoch: number) {
		const updatedCell = this.getCellInMemory(position);

		if (updatedCell.lastEpochUpdate >= 1 && updatedCell.life > 0) {
			const {newLife, epochUsed} = this.computeNewLife(
				updatedCell.lastEpochUpdate,
				updatedCell.enemymask,
				updatedCell.delta,
				updatedCell.life,
				epoch,
			);
			if (newLife == 0) {
				updatedCell.delta = 0;
			}
			updatedCell.life = newLife;
			updatedCell.lastEpochUpdate = epochUsed;
		}

		return updatedCell;
	}

	ownerOf(position: bigint) {
		return this.state.owners[position.toString()] || zeroAddress;
	}

	updateCellAsDead(position: bigint, cell: ContractCell, newLife: number, epochUsed: number) {
		cell.life = newLife;
		cell.lastEpochUpdate = epochUsed;
		cell.delta = 0;
		this.state.cells[position.toString()] = cell;
		// console.log({
		// 	DEAD: 'DEAD',
		// 	position: bigIntIDToXY(position),
		// 	cell,
		// });
	}

	updateCellFromNeighbor(
		position: bigint,
		cell: ContractCell,
		newLife: number,
		epoch: number,
		neighbourIndex: number,
		oldColor: Color,
		newColor: Color,
	) {
		if (newColor == Color.None) {
			// COLLISION, previous update added a color that should not be there
			if (cell.color == oldColor) {
				cell.delta -= 1;
			} else {
				cell.delta += 1;
				// remove enemy as it was added by COLLISION
				cell.enemymask = cell.enemymask & ((1 << neighbourIndex) ^ 0xff);
			}
		} else if (cell.color == oldColor) {
			// then newColor is different (see assert above)
			cell.enemymask = cell.enemymask | (1 << neighbourIndex);
			cell.delta -= 2;
		} else if (cell.color == newColor) {
			// then old color was different
			cell.delta += oldColor == Color.None ? 1 : 2;
			cell.enemymask = cell.enemymask & ((1 << neighbourIndex) ^ 0xff);
		} else if (oldColor == Color.None) {
			// if there were no oldCOlor and the newColor is not your (already checked in previous if clause)
			cell.delta -= 1;
			cell.enemymask = cell.enemymask | (1 << neighbourIndex);
		}
		cell.lastEpochUpdate = epoch;
		cell.life = newLife;
		this.state.cells[position.toString()] = cell;
		// console.log({
		// 	UPDATE_FROM_NEIGBOR: 'UPDATE_FROM_NEIGBOR',
		// 	position: bigIntIDToXY(position),
		// 	cell,
		// });
	}

	updateCell(position: bigint, epoch: number, neighbourIndex: number, oldColor: Color, newColor: Color): number {
		let enemyOrFriend = 0;
		const cell = this.getCellInMemory(position);

		const lastUpdate = cell.lastEpochUpdate;
		const color = cell.color;
		if (color != Color.None) {
			enemyOrFriend = color == newColor ? 1 : -1;
		}

		if (lastUpdate >= 1 && color != Color.None && cell.life > 0) {
			// we only consider cell with color that are not dead
			if (lastUpdate < epoch) {
				// of there is life to update we compute the new life
				const {newLife, epochUsed} = this.computeNewLife(lastUpdate, cell.enemymask, cell.delta, cell.life, epoch);

				// console.log('    newLife: %s ', newLife);
				// console.log('    epochUsed: %s ', epochUsed);

				if (newLife == 0) {
					// if dead, no need to update delta and enemymask
					this.updateCellAsDead(position, cell, newLife, epochUsed);
				} else {
					// if not dead we update the delta and enemymask
					this.updateCellFromNeighbor(position, cell, newLife, epoch, neighbourIndex, oldColor, newColor);
				}
			} else {
				// else if we simply update the delta and enemymask
				this.updateCellFromNeighbor(position, cell, cell.life, epoch, neighbourIndex, oldColor, newColor);
			}
		}

		return enemyOrFriend;
	}

	updateNeighbours(
		position: bigint,
		epoch: number,
		oldColor: Color,
		newColor: Color,
	): {newDelta: number; newEnemymask: number} {
		const {x, y} = bigIntIDToXY(position);
		const data = {
			newDelta: 0,
			newEnemymask: 0,
		};

		{
			const upPosition = xyToBigIntID(x, y - 1);
			const enemyOrFriend = this.updateCell(upPosition, epoch, 2, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newEnemymask = data.newEnemymask | 1;
			}
			data.newDelta += enemyOrFriend;
		}
		{
			const leftPosition = xyToBigIntID(x - 1, y);

			const enemyOrFriend = this.updateCell(leftPosition, epoch, 3, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newEnemymask = data.newEnemymask | 2;
			}
			data.newDelta += enemyOrFriend;
		}

		{
			const downPosition = xyToBigIntID(x, y + 1);
			const enemyOrFriend = this.updateCell(downPosition, epoch, 0, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newEnemymask = data.newEnemymask | 4;
			}
			data.newDelta += enemyOrFriend;
		}
		{
			const rightPosition = xyToBigIntID(y + 1, y);
			const enemyOrFriend = this.updateCell(rightPosition, epoch, 1, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newEnemymask = data.newEnemymask | 8;
			}
			data.newDelta += enemyOrFriend;
		}
		return data;
	}

	computeMove(player: `0x${string}`, epoch: number, move: ContractMove) {
		const MAX_LIFE = this.MAX_LIFE;

		const {x, y} = bigIntIDToXY(move.position);
		const newPosition = xyToBigIntID(x, y);
		if (move.position != newPosition) {
			console.log({x, y, position: move.position, newPosition});
		}

		const currentState = this.getUpdatedCell(move.position, epoch);

		if (move.color == Color.None) {
			// this is a leave move
			if (currentState.life == MAX_LIFE && this.ownerOf(move.position) == player) {
				// only valid id life == MAX_LIFE and player is owner

				this.updateNeighbours(move.position, epoch, currentState.color, Color.None);

				// we reset all, except the lastEpochUpdate
				// this allow us to make sure nobody else can make a move on that cell
				currentState.life = 0;
				currentState.color = Color.None;
				currentState.lastEpochUpdate = epoch;
				currentState.delta = 0;
				currentState.enemymask = 0;
				currentState.epochWhenTokenIsAdded = 0;
				this.state.cells[move.position.toString()] = currentState;
				this.state.owners[move.position.toString()] = zeroAddress;
				// console.log({
				// 	None: 'None',
				// 	position: bigIntIDToXY(move.position),
				// 	currentState,
				// });
			} else {
				// TODO ?
			}
		}

		if (currentState.epochWhenTokenIsAdded == epoch) {
			// COLLISION
			// Evil Color is added instead
			// keep the stake
			if (currentState.life != 0) {
				if (currentState.color != Color.Evil) {
					const {newDelta, newEnemymask} = this.updateNeighbours(move.position, epoch, currentState.color, Color.Evil);

					currentState.color = Color.Evil; // TODO keep track of num token staked here, or do we burn ?
					currentState.delta = newDelta;
					currentState.enemymask = newEnemymask;
					this.state.cells[move.position.toString()] = currentState;
					this.state.owners[move.position.toString()] = '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF';
					// console.log({
					// 	COLLISION: 'COLLISION',
					// 	position: bigIntIDToXY(move.position),
					// 	currentState,
					// });
				} else {
					// TODO Add further stake, or do we burn?
				}
			} else {
				// we skip
				// tokensPlaced = 0 so this is not counted
				if (currentState.life == 0) {
					this.state.cells[move.position.toString()] = currentState;
					this.state.owners[move.position.toString()] = zeroAddress;
					// console.log({
					// 	SKIP: 'SKIP',
					// 	position: bigIntIDToXY(move.position),
					// 	currentState,
					// });
					// TODO Transfer
				}
			}
		} else if (currentState.life == 0 && (currentState.lastEpochUpdate == 0 || currentState.color != Color.None)) {
			if (currentState.life == 0 || currentState.color != move.color) {
				// only update neighbour if color changed or if life is zero, since in that case the delta is lost (TODO revisit this)
				const {newDelta, newEnemymask} = this.updateNeighbours(move.position, epoch, currentState.color, move.color);

				currentState.life = 1;
				currentState.epochWhenTokenIsAdded = epoch;
				currentState.lastEpochUpdate = epoch;
				currentState.color = move.color;
				currentState.delta = newDelta;
				currentState.enemymask = newEnemymask;
			} else {
				// TODO fetch neighbours to compute delta
				currentState.delta = 0;
				currentState.enemymask = 0;
			}

			this.state.cells[move.position.toString()] = currentState;
			this.state.owners[move.position.toString()] = player;
			// console.log({
			// 	PLAYER: 'PLAYER',
			// 	position: bigIntIDToXY(move.position),
			// 	currentState,
			// });
			// TODO Transfer
		} else {
			// invalid move
			if (currentState.life == 0) {
				this.state.cells[move.position.toString()] = currentState;
				this.state.owners[move.position.toString()] = zeroAddress;

				// console.log({
				// 	INVALID: 'INVALID',
				// 	position: bigIntIDToXY(move.position),
				// 	currentState,
				// });
				// TODO Transfer
			}
		}
	}

	// ----------------------

	forceSimpleCells(epoch: number, cells: readonly ContractSimpleCell[]) {
		for (const simpleCell of cells) {
			const {delta, enemymask} = this.updateNeighbosrDelta(simpleCell.position, simpleCell.color, epoch);

			this.state.cells[simpleCell.position.toString()] = {
				lastEpochUpdate: epoch,
				epochWhenTokenIsAdded: epoch,
				color: simpleCell.color,
				life: simpleCell.life,
				delta: delta,
				enemymask: enemymask,
			};
			this.state.owners[simpleCell.position.toString()] = simpleCell.owner;
			// console.log({
			// 	FORCE_FIRST: 'FORCE_FIRST',
			// 	position: bigIntIDToXY(simpleCell.position),
			// 	cell: this.getCellInMemory(simpleCell.position),
			// });
		}

		for (const simpleCell of cells) {
			const cell = this.getCellInMemory(simpleCell.position);

			// we act as if the token were added in previous epochs
			// this is so it does not affect the resolution phase
			const potentialLife = cell.life - cell.delta;
			cell.life = potentialLife;

			this.state.cells[simpleCell.position.toString()] = {
				lastEpochUpdate: epoch - 1,
				epochWhenTokenIsAdded: epoch - 1,
				color: cell.color,
				life: cell.life,
				delta: cell.delta,
				enemymask: cell.enemymask,
			};

			// console.log({
			// 	FORCE: 'FORCE',
			// 	position: bigIntIDToXY(simpleCell.position),
			// 	cell: this.getCellInMemory(simpleCell.position),
			// });
		}
	}

	updateNeighbosrDelta(center: bigint, color: Color, epoch: number): {delta: number; enemymask: number} {
		const {x, y} = bigIntIDToXY(center);
		const data = {delta: 0, enemymask: 0};

		{
			const upPosition = xyToBigIntID(x, y - 1);
			const cell = this.getCellInMemory(upPosition);
			if (cell.color != Color.None) {
				const enemyOrFriend = this.isEnemyOrFriend(color, cell.color);
				if (enemyOrFriend < 0) {
					data.enemymask = data.enemymask | 1;
				}
				data.delta += enemyOrFriend;
				this.updateCellFromNeighbor(upPosition, cell, cell.life, epoch, 2, Color.None, color);
			}
		}
		{
			const leftPosition = xyToBigIntID(x - 1, y);
			const cell = this.getCellInMemory(leftPosition);
			if (cell.color != Color.None) {
				const enemyOrFriend = this.isEnemyOrFriend(color, cell.color);
				if (enemyOrFriend < 0) {
					data.enemymask = data.enemymask | 2;
				}
				data.delta += enemyOrFriend;
				this.updateCellFromNeighbor(leftPosition, cell, cell.life, epoch, 3, Color.None, color);
			}
		}

		{
			const downPosition = xyToBigIntID(x, y + 1);
			const cell = this.getCellInMemory(downPosition);
			if (cell.color != Color.None) {
				const enemyOrFriend = this.isEnemyOrFriend(color, cell.color);
				if (enemyOrFriend < 0) {
					data.enemymask = data.enemymask | 4;
				}
				data.delta += enemyOrFriend;
				this.updateCellFromNeighbor(downPosition, cell, cell.life, epoch, 0, Color.None, color);
			}
		}
		{
			const rightPosition = xyToBigIntID(x + 1, y);
			const cell = this.getCellInMemory(rightPosition);
			if (cell.color != Color.None) {
				const enemyOrFriend = this.isEnemyOrFriend(color, cell.color);
				if (enemyOrFriend < 0) {
					data.enemymask = data.enemymask | 8;
				}
				data.delta += enemyOrFriend;
				this.updateCellFromNeighbor(rightPosition, cell, cell.life, epoch, 1, Color.None, color);
			}
		}
		return data;
	}

	isEnemyOrFriend(a: Color, b: Color) {
		if (a != Color.None && b != Color.None) {
			return a == b ? 1 : -1;
		}
		return 0;
	}
}
