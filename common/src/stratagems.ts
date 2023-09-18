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
	Blue = 1, // 5ab9bb
	Red = 2, // c5836e
	Green = 3, // 8bffcb
	Yellow = 4, // d3d66d
	Purple = 5, // a9799d
	Evil = 6, // 3d3d3d
}

export type ContractCell = {
	lastEpochUpdate: number;
	epochWhenTokenIsAdded: number;
	color: number;
	life: number;
	delta: number;
	enemyMap: number;
	distribution: number;
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
		enemyMap: number,
		delta: number,
		life: number,
		epoch: number,
	): {newLife: number; epochUsed: number} {
		const MAX_LIFE = this.MAX_LIFE;

		const data = {
			newLife: life,
			epochUsed: lastUpdate,
		};
		if (lastUpdate >= 1 && life > 0) {
			let epochDelta = epoch - lastUpdate;
			if (epochDelta > 0) {
				let effectiveDelta = delta != 0 ? delta : -1;
				if (effectiveDelta < 0 && enemyMap == 0) {
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
			enemyMap: cell?.enemyMap || 0,
			epochWhenTokenIsAdded: cell?.epochWhenTokenIsAdded || 0,
			life: cell?.life || 0,
			distribution: cell?.distribution || 0,
		};
	}

	getUpdatedCell(position: bigint, epoch: number) {
		const updatedCell = this.getCellInMemory(position);

		if (updatedCell.lastEpochUpdate >= 1 && updatedCell.life > 0) {
			const {newLife, epochUsed} = this.computeNewLife(
				updatedCell.lastEpochUpdate,
				updatedCell.enemyMap,
				updatedCell.delta,
				updatedCell.life,
				epoch,
			);
			updatedCell.life = newLife;
			updatedCell.lastEpochUpdate = epochUsed;
		}

		return updatedCell;
	}

	ownerOf(position: bigint) {
		return this.state.owners[position.toString()] || zeroAddress;
	}

	updateCellFromNeighbor(
		position: bigint,
		cell: ContractCell,
		newLife: number,
		epoch: number,
		neighbourIndex: number,
		oldColor: Color,
		newColor: Color,
	): number {
		// const {x, y} = bigIntIDToXY(position);
		// console.log(`updateCellFromNeighbor ${x},${y}`, cell);
		let due = 0;
		if (cell.life > 0 && newLife == 0) {
			// we just died, we establish the distributionMap and counts
			cell.distribution = (cell.enemyMap << 4) + this.countBits(cell.enemyMap);
		}

		if (((cell.distribution >> 4) & (2 ** neighbourIndex)) == 2 ** neighbourIndex) {
			due = 12 / (cell.distribution & 0x0f);
			cell.distribution = ((cell.distribution >> 4) & (~(2 ** neighbourIndex) << 4)) + (cell.distribution & 0x0f);
		}

		if (oldColor != newColor) {
			if (newColor == Color.None) {
				if (cell.color == oldColor) {
					cell.delta -= 1;
				} else {
					cell.delta += 1;
					cell.enemyMap = cell.enemyMap & ((1 << neighbourIndex) ^ 0xff);
				}
			} else if (cell.color == oldColor) {
				// then newColor is different (see assert above)
				cell.enemyMap = cell.enemyMap | (1 << neighbourIndex);
				cell.delta -= 2;
			} else if (cell.color == newColor) {
				// then old color was different
				cell.delta += oldColor == Color.None ? 1 : 2;
				cell.enemyMap = cell.enemyMap & ((1 << neighbourIndex) ^ 0xff);
			} else if (oldColor == Color.None) {
				// if there were no oldCOlor and the newColor is not your (already checked in previous if clause)
				cell.delta -= 1;
				cell.enemyMap = cell.enemyMap | (1 << neighbourIndex);
			}
		}
		cell.lastEpochUpdate = epoch;
		cell.life = newLife;
		this.state.cells[position.toString()] = cell;
		// console.log(`AFTER updateCellFromNeighbor `, cell);
		// console.log(`AFTER updateCellFromNeighbor `, this.getUpdatedCell(position, epoch));
		return due;
	}

	updateCell(position: bigint, epoch: number, neighbourIndex: number, oldColor: Color, newColor: Color) {
		const data = {
			enemyOrFriend: 0,
			due: 0,
		};
		const cell = this.getCellInMemory(position);

		const lastUpdate = cell.lastEpochUpdate;
		const color = cell.color;
		if (color != Color.None) {
			data.enemyOrFriend = color == newColor ? 1 : -1;
		}

		if (lastUpdate >= 1 && color != Color.None) {
			// we only consider cell with color that are not dead
			if (cell.life > 0 && lastUpdate < epoch) {
				// of there is life to update we compute the new life
				const {newLife, epochUsed} = this.computeNewLife(lastUpdate, cell.enemyMap, cell.delta, cell.life, epoch);
				data.due = this.updateCellFromNeighbor(position, cell, newLife, epoch, neighbourIndex, oldColor, newColor);
			} else {
				data.due = this.updateCellFromNeighbor(position, cell, cell.life, epoch, neighbourIndex, oldColor, newColor);
			}
		}

		return data;
	}

	updateNeighbours(
		position: bigint,
		epoch: number,
		oldColor: Color,
		newColor: Color,
		distribution: number,
	): {newComputedDelta: number; newComputedEnemyMap: number; numDue: number} {
		const {x, y} = bigIntIDToXY(position);
		// console.log(`updating neighbors of ${x},${y}`);
		const data = {
			newComputedDelta: 0,
			newComputedEnemyMap: 0,
			numDue: 0,
		};

		{
			const upPosition = xyToBigIntID(x, y - 1);
			const {enemyOrFriend, due} = this.updateCell(upPosition, epoch, 2, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newComputedEnemyMap = data.newComputedEnemyMap | 1;
			}
			data.numDue += due;
			// if (((distribution >> 4) & 4) == 4) {
			// owner -->
			// }
			data.newComputedDelta += enemyOrFriend;
		}

		{
			const leftPosition = xyToBigIntID(x - 1, y);
			const {enemyOrFriend, due} = this.updateCell(leftPosition, epoch, 3, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newComputedEnemyMap = data.newComputedEnemyMap | 2;
			}
			data.numDue += due;
			// if (((distribution >> 4) & 8) == 8) {
			// owner -->
			// }
			data.newComputedDelta += enemyOrFriend;
		}

		{
			const downPosition = xyToBigIntID(x, y + 1);
			const {enemyOrFriend, due} = this.updateCell(downPosition, epoch, 0, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newComputedEnemyMap = data.newComputedEnemyMap | 4;
			}
			data.numDue += due;
			// if (((distribution >> 4) & 1) == 1) {
			// owner -->
			// }
			data.newComputedDelta += enemyOrFriend;
		}

		{
			const rightPosition = xyToBigIntID(x + 1, y);
			const {enemyOrFriend, due} = this.updateCell(rightPosition, epoch, 1, oldColor, newColor);
			if (enemyOrFriend < 0) {
				data.newComputedEnemyMap = data.newComputedEnemyMap | 8;
			}
			data.numDue += due;
			// if (((distribution >> 4) & 2) == 2) {
			// owner -->
			// }
			data.newComputedDelta += enemyOrFriend;
		}

		return data;
	}

	countBits(n: number): number {
		let count = 0;
		while (n != 0) {
			n = n & (n - 1);
			count++;
		}
		return count;
	}

	propagate(move: ContractMove, epoch: number, color: Color, distribution: number) {
		const data = {
			newDelta: 0,
			newEnemyMap: 0,
		};

		const {
			newComputedDelta,
			newComputedEnemyMap,
			numDue,
			// ownersToPay
		} = this.updateNeighbours(move.position, epoch, color, move.color, distribution);

		// if (numDue > 0) {
		// 	_collectTransfer(
		// 		transferCollection,
		// 		TokenTransfer({to: payable(_ownerOf(move.position)), amount: (numDue * NUM_TOKENS_PER_GEMS) / 12})
		// 	);
		// }
		// for (uint8 i = 0; i < 4; i++) {
		// 	if (ownersToPay[i] != address(0)) {
		// 		_collectTransfer(
		// 			transferCollection,
		// 			TokenTransfer({to: payable(ownersToPay[i]), amount: (NUM_TOKENS_PER_GEMS / (distribution & 0x0f))})
		// 		);
		// 	}
		// }
		data.newDelta = newComputedDelta;
		data.newEnemyMap = newComputedEnemyMap;

		return data;
	}

	computeMove(player: `0x${string}`, epoch: number, moveAsInput: ContractMove) {
		const move = {...moveAsInput};
		const MAX_LIFE = this.MAX_LIFE;

		const currentState = this.getUpdatedCell(move.position, epoch);

		// const {x, y} = bigIntIDToXY(move.position);
		// console.log(`COMPUTE_MOVE for ${x}, ${y}`, currentState);
		// console.log(this.state.cells[move.position.toString()]);

		// we might have distribution still to do
		let distribution = currentState.distribution;
		if (currentState.life == 0 && currentState.lastEpochUpdate != 0) {
			// if we just died, currentState.lastEpochUpdate > 0
			// we have to distribute to all
			distribution = (currentState.enemyMap << 4) + this.countBits(currentState.enemyMap);

			/// we are now dead for real
			currentState.lastEpochUpdate = 0;
		}

		// we then apply our move:

		// first we do some validity checks
		if (move.color == Color.None) {
			if (currentState.life != MAX_LIFE || this.ownerOf(move.position) != player) {
				// invalid move
				// return (0, 0, NUM_TOKENS_PER_GEMS);
				return;
			}

			// _collectTransfer(transferCollection, TokenTransfer({to: payable(player), amount: NUM_TOKENS_PER_GEMS}));
		}
		// then we consider the case of collision and transform such move as Color Evil
		else if (currentState.epochWhenTokenIsAdded == epoch) {
			if (currentState.life != 0) {
				move.color = Color.Evil;
				// TODO Add further stake, or do we burn? or return?
			} else {
				// invalid move, on top of a MAX, that become None ?
				// return (0, 0, NUM_TOKENS_PER_GEMS);
				return;
			}
		}

		const {newDelta, newEnemyMap} = this.propagate(move, epoch, currentState.color, distribution);

		currentState.color = move.color;
		currentState.distribution = 0;
		currentState.epochWhenTokenIsAdded = epoch; // used to prevent overwriting, even Color.None

		if (currentState.color == Color.None) {
			currentState.life = 0;
			currentState.lastEpochUpdate = 0;
			currentState.delta = 0;
			currentState.enemyMap = 0;
			this.state.owners[move.position.toString()] = zeroAddress;
			// tokensReturned = NUM_TOKENS_PER_GEMS;
		} else {
			// tokensPlaced = NUM_TOKENS_PER_GEMS;

			currentState.enemyMap = newEnemyMap;

			currentState.delta = newDelta;
			currentState.life = 1;
			currentState.lastEpochUpdate = epoch;
			if (currentState.color == Color.Evil) {
				this.state.owners[move.position.toString()] = '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF';
			} else {
				this.state.owners[move.position.toString()] = player;
			}
		}

		this.state.cells[move.position.toString()] = currentState;

		// console.log(`AFTER`, currentState);
	}

	// ----------------------

	forceSimpleCells(epoch: number, cells: readonly ContractSimpleCell[]) {
		for (const simpleCell of cells) {
			const {delta, enemyMap} = this.updateNeighbosrDelta(simpleCell.position, simpleCell.color, epoch);

			this.state.cells[simpleCell.position.toString()] = {
				lastEpochUpdate: epoch,
				epochWhenTokenIsAdded: epoch,
				color: simpleCell.color,
				life: simpleCell.life,
				delta: delta,
				enemyMap: enemyMap,
				distribution: 0,
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
			let effectiveDelta = cell.delta != 0 ? cell.delta : -1;
			if (effectiveDelta < 0 && cell.enemyMap == 0) {
				effectiveDelta = 0;
			}
			let potentialLife = cell.life - effectiveDelta;
			if (potentialLife < 0) {
				potentialLife = 0;
			}
			cell.life = potentialLife;

			const newCell = {
				lastEpochUpdate: epoch - 1,
				epochWhenTokenIsAdded: epoch - 1,
				color: cell.color,
				life: cell.life,
				delta: cell.delta,
				enemyMap: cell.enemyMap,
				distribution: 0,
			};

			this.state.cells[simpleCell.position.toString()] = newCell;
			// const {x, y} = bigIntIDToXY(simpleCell.position);
			// console.log(`forceSimpleCell ${x}, ${y}`, newCell);

			// console.log({
			// 	FORCE: 'FORCE',
			// 	position: bigIntIDToXY(simpleCell.position),
			// 	cell: this.getCellInMemory(simpleCell.position),
			// });
		}
	}

	updateNeighbosrDelta(center: bigint, color: Color, epoch: number): {delta: number; enemyMap: number} {
		const {x, y} = bigIntIDToXY(center);
		const data = {delta: 0, enemyMap: 0};

		{
			const upPosition = xyToBigIntID(x, y - 1);
			const cell = this.getCellInMemory(upPosition);
			if (cell.color != Color.None) {
				const enemyOrFriend = this.isEnemyOrFriend(color, cell.color);
				if (enemyOrFriend < 0) {
					data.enemyMap = data.enemyMap | 1;
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
					data.enemyMap = data.enemyMap | 2;
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
					data.enemyMap = data.enemyMap | 4;
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
					data.enemyMap = data.enemyMap | 8;
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
