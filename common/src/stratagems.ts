export type Move = {position: bigint; color: Color};

export function bigIntIDToXYID(position: bigint): string {
	const {x, y} = bigIntIDToXY(position);
	return '' + x + ',' + y;
}

export type CellPosition = {
	x: number;
	y: number;
};

// using 64 bits room id
// const leftMostBit = BigInt('0x8000000000000000');
// const bn32 = BigInt('0x10000000000000000');
export function bigIntIDToXY(position: bigint): CellPosition {
	const bn = BigInt(position);
	const x = Number(BigInt.asIntN(32, bn));
	const y = Number(BigInt.asIntN(32, bn >> 32n));
	// const rx = x >= leftMostBit ? -(bn32 - x) : x;
	// const ry = y >= leftMostBit ? -(bn32 - y) : y;
	return {x, y};
}

export type CellBigIntPosition = {
	x: bigint;
	y: bigint;
};

export function bigIntIDToBigintXY(position: bigint): CellBigIntPosition {
	const bn = BigInt(position);
	const x = BigInt.asIntN(32, bn);
	const y = BigInt.asIntN(32, bn >> 32n);
	return {x, y};
}

export function xyToXYID(x: number, y: number) {
	return '' + x + ',' + y;
}

export function xyToBigIntID(x: number, y: number): bigint {
	const bn = BigInt.asUintN(32, BigInt(x)) + (BigInt.asUintN(32, BigInt(y)) << 32n);
	return bn;
}

export enum Color {
	None,
	Blue,
	Red,
	Green,
	Yellow,
	Purple,
	Evil,
}

export enum MoveColor {
	None,
	Blue,
	Red,
	Green,
	Yellow,
	Purple,
}

export type ContractFullCell = {
	owner: `0x${string}`;
	lastEpochUpdate: number;
	epochWhenTokenIsAdded: number;
	color: number;
	life: number;
	delta: number;
	enemymask: number;
};

export class Stratagems {
	constructor(
		private state: {cells: {[position: string]: ContractFullCell}; owners: {[poistion: string]: `0x${string}`}},
		public MAX_LIFE: number
	) {}

	computeNewLife(
		lastUpdate: number,
		enemymask: number,
		delta: number,
		life: number,
		epoch: number
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

	getUpdatedCell(position: bigint, epoch: number) {
		const cell = this.state.cells[position.toString()];
		const updatedCell: ContractFullCell = {
			owner: cell.owner,
			lastEpochUpdate: cell.lastEpochUpdate,
			color: cell.color,
			delta: cell.delta,
			enemymask: cell.enemymask,
			epochWhenTokenIsAdded: cell.epochWhenTokenIsAdded,
			life: cell.life,
		};

		if (updatedCell.lastEpochUpdate >= 1 && updatedCell.life > 0) {
			const {newLife, epochUsed} = this.computeNewLife(
				updatedCell.lastEpochUpdate,
				updatedCell.enemymask,
				updatedCell.delta,
				updatedCell.life,
				epoch
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
		return this.state.owners[position.toString()];
	}

	updateCellAsDead(position: bigint, cell: ContractFullCell, newLife: number, epochUsed: number) {
		cell.life = newLife;
		cell.lastEpochUpdate = epochUsed;
		cell.delta = 0;

		// numAddressesToDistributeTo = _distributeDeath(
		// 	transfers,
		// 	numAddressesToDistributeTo,
		// 	position,
		// 	cell.enemymask,
		// 	epochUsed
		// );

		this.state.cells[position.toString()] = cell;
		// return numAddressesToDistributeTo;
	}

	updateCellFromNeighbor(
		position: bigint,
		cell: ContractFullCell,
		newLife: number,
		epoch: number,
		neighbourIndex: number,
		oldColor: Color,
		newColor: Color
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
	}

	updateCell(position: bigint, epoch: number, neighbourIndex: number, oldColor: Color, newColor: Color): number {
		let enemyOrFriend = 0;
		const cell = this.state.cells[position.toString()];

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
		newColor: Color
	): {newDelta: number; newEnemymask: number} {
		const {x, y} = bigIntIDToBigintXY(position);
		const data = {
			newDelta: 0,
			newEnemymask: 0,
		};

		let enemyOrFriend = 0;
		{
			const upPosition = (y - 1n) << (32n + x);
			const enemyOrFriend = this.updateCell(upPosition, epoch, 2, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newEnemymask = data.newEnemymask | 1;
			}
			data.newDelta += enemyOrFriend;
		}
		{
			const leftPosition = (y << 32n) + (x - 1n);

			const enemyOrFriend = this.updateCell(leftPosition, epoch, 3, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newEnemymask = data.newEnemymask | 2;
			}
			data.newDelta += enemyOrFriend;
		}

		{
			const downPosition = ((y + 1n) << 32n) + x;
			const enemyOrFriend = this.updateCell(downPosition, epoch, 0, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newEnemymask = data.newEnemymask | 4;
			}
			data.newDelta += enemyOrFriend;
		}
		{
			const rightPosition = (y << 32n) + (x + 1n);
			const enemyOrFriend = this.updateCell(rightPosition, epoch, 1, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newEnemymask = data.newEnemymask | 8;
			}
			data.newDelta += enemyOrFriend;
		}
		return data;
	}

	computeMove(player: `0x${string}`, epoch: number, move: Move) {
		const MAX_LIFE = this.MAX_LIFE;

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
				this.state.owners[move.position.toString()] = `0x00`;
			} else {
				// TODO ?
			}
		}

		// if (currentState.life == 0 && currentState.lastEpochUpdate != 0) {
		// 	// we are here because life reach zero (lastEpochUpdate != 0 indicates that the cell was alive and not reset like below)
		// 	// Note: we need to pay attention when we add the leave mechanism
		// 	// newNumAddressesToDistributeTo = _distributeDeath(
		// 	// 	transfers,
		// 	// 	numAddressesToDistributeTo,
		// 	// 	move.position,
		// 	// 	currentState.enemymask,
		// 	// 	currentState.lastEpochUpdate
		// 	// );
		// }

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
				} else {
					// TODO Add further stake, or do we burn?
				}
			} else {
				// we skip
				// tokensPlaced = 0 so this is not counted
				if (currentState.life == 0) {
					this.state.cells[move.position.toString()] = currentState;
					this.state.owners[move.position.toString()] = '0x00';
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
			// TODO Transfer
		} else {
			// invalid move
			if (currentState.life == 0) {
				this.state.cells[move.position.toString()] = currentState;
				this.state.owners[move.position.toString()] = '0x00';
				// TODO Transfer
			}
		}
	}
}
