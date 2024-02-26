import {zeroAddress} from 'viem';
import {Color, ContractFullCell} from './types';
import {bigIntIDToXY, xyToBigIntID} from './stratagems';

export type Cell = {
	x: number;
	y: number;
	owner?: number;
	color: Color; //0 | 1 | 2 | 3 | 4 | 5 | 6;
	life: number;
	// tokens
	lastEpochUpdate?: number;
	epochWhenTokenIsAdded?: number;
	delta?: number;
	enemyMap?: number;
	stake: number; // for Evil, else always 1
};

type TmpCell = Cell & {
	addition?: boolean;
	empty: boolean;
	playerAsString: string;
};

export type Action = {
	x: number;
	y: number;
	owner: number;
	color: Color;
};

export type Grid = {
	cells: Cell[];
	width: number;
	height: number;
	actions?: Action[];
};

export type ContractSimpleCell = {
	position: bigint;
	owner: `0x${string}`;
	color: number; // 0 | 1 | 2 | 3 | 4 | 5 | 6;
	life: number;
	stake: number;
};

function cellID(cell: {x: number; y: number}): string;
function cellID(x: number, y: number): string;
function cellID(x: any, y?: number): string {
	if (typeof x === 'object') {
		return `${x.x},${x.y}`;
	}
	return `${x},${y}`;
}

function colorCodeOf(color: Color): string {
	switch (color) {
		case Color.Blue:
			return 'B';
		case Color.Red:
			return 'R';
		case Color.Green:
			return 'G';
		case Color.Yellow:
			return 'Y';
		case Color.Purple:
			return 'P';
		case Color.Evil:
			return 'E';
		case Color.None:
			return ' ';
	}
}

function emptyCell(x: number, y: number): Cell {
	return {
		x,
		y,
		owner: undefined,
		color: Color.None,
		life: 0,
		stake: 0,
	};
}

export function parseGrid(str: string, forcePlayer?: number): Grid {
	const tmpCellMap = new Map<string, TmpCell>();

	let started = false;
	let indent = 0;
	let maxX = 0;
	let maxY = 0;
	let line = 0;
	let charI = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charAt(i);

		switch (char) {
			case '-':
				if (!started) {
					started = true;
					indent = charI;
				}
				break;
			case '|':
				break;
			case `\n`:
				charI = -indent;
				if (started) {
					line++;
				}
				continue;
		}
		if (started && charI >= 0 && line % 3 != 0) {
			if (charI % 5 != 0) {
				const x = Math.floor(charI / 5);
				const y = Math.floor(line / 3);
				if (x > maxX) {
					maxX = x;
				}
				if (y > maxY) {
					maxY = y;
				}
				let cell = tmpCellMap.get(cellID(x, y));
				if (!cell) {
					cell = {
						empty: true,
						playerAsString: '',
						...emptyCell(x, y),
					};
					tmpCellMap.set(cellID(x, y), cell);
				}
				if (charI % 5 == 1) {
					if (char === '+') {
						cell.addition = true;
						cell.empty = false;
					}
				} else {
					if (line % 3 == 1) {
						switch (char) {
							case ' ':
								break;
							case 'B':
								cell.color = Color.Blue;
								cell.empty = false;
								break;
							case 'R':
								cell.color = Color.Red;
								cell.empty = false;
								break;
							case 'G':
								cell.color = Color.Green;
								cell.empty = false;
								break;
							case 'Y':
								cell.color = Color.Yellow;
								cell.empty = false;
								break;
							case 'P':
								cell.color = Color.Purple;
								cell.empty = false;
								break;
							case 'E':
								cell.color = Color.Evil;
								cell.empty = false;
								break;
							case '0':
								cell.life = 0;
								break;
							case '1':
								cell.life = 1;
								break;
							case '2':
								cell.life = 2;
								break;
							case '3':
								cell.life = 3;
								break;
							case '4':
								cell.life = 4;
								break;
							case '5':
								cell.life = 5;
								break;
							case '6':
								cell.life = 6;
								break;
							case '7':
								cell.life = 7;
								break;
							case '8':
								cell.life = 8;
								break;
							case '9':
								cell.life = 9;
								break;
						}
					} else {
						if (char != ' ') {
							cell.playerAsString += char;
						}
					}
				}
			}
		}
		charI++;
	}

	const actions: Action[] = [];
	const cells: Cell[] = [];
	for (const cell of tmpCellMap.values()) {
		if (!cell.empty) {
			const {empty, playerAsString, addition, ...onlyCell} = cell;
			// console.log({playerAsString});
			if (playerAsString !== '') {
				const ownerNumber = parseInt(playerAsString);
				onlyCell.owner = ownerNumber;
				if (ownerNumber < 0) {
					onlyCell.stake = -ownerNumber;
				} else {
					onlyCell.stake = 1;
				}
			}
			if (forcePlayer) {
				onlyCell.owner = forcePlayer;
			}
			if (addition) {
				if (!onlyCell.owner) {
					throw new Error(`addition (+) need an owner`);
				}
				let color: Color;
				if (onlyCell.color > 5) {
					throw new Error(`invalid color value for action: ${onlyCell.color}`);
				}
				color = onlyCell.color as unknown as Color;
				actions.push({
					color,
					owner: onlyCell.owner,
					x: onlyCell.x,
					y: onlyCell.y,
				});
			} else {
				cells.push(onlyCell);
			}
		}
	}
	if (actions.length > 0) {
		return {cells, width: maxX + 1, height: maxY + 1, actions};
	}
	return {cells, width: maxX + 1, height: maxY + 1};
}

export function renderGrid(grid: Grid): string {
	const cellMap = new Map<string, Cell>();
	for (const cell of grid.cells) {
		cellMap.set(cellID(cell), cell);
	}
	let str = '';
	for (let x = 0; x < grid.width; x++) {
		str += '-----';
	}
	str += `\n`;
	for (let y = 0; y < grid.height; y++) {
		for (let r = 0; r < 3; r++) {
			if (r != 2) {
				str += '|';
			}

			for (let x = 0; x < grid.width; x++) {
				const cell = cellMap.get(cellID(x, y));
				if (r == 2) {
					str += '-----';
				} else {
					// console.log({owner: cell?.owner});
					if (cell?.owner != undefined) {
						if (r == 0) {
							str += ' ';
							str += colorCodeOf(cell.color);
							str += cell.life.toString();
							str += ' ';
						} else {
							if (cell.owner !== undefined) {
								let ownerNumber = cell.owner;
								if (cell.owner === 0) {
									ownerNumber = -cell.stake;
								}
								str += ` ${ownerNumber.toString().padStart(2, '0')} `;
							} else {
								str += '    ';
							}
						}
					} else {
						str += '    ';
					}
					str += '|';
				}
			}
			str += `\n`;
		}
	}
	return str;
}

export function toContractSimpleCell(accounts: `0x${string}`[]): (cell: Cell) => ContractSimpleCell {
	return (cell: Cell) => ({
		color: cell.color,
		life: cell.life,
		owner: cell.owner ? (cell.owner >= 0 ? accounts[cell.owner] : accounts[0]) : zeroAddress,
		position: xyToBigIntID(cell.x, cell.y),
		stake: cell.stake,
	});
}

export function fromContractFullCellToCell(
	accounts: `0x${string}`[],
): (data: {cell: ContractFullCell; id: bigint}) => Cell {
	return ({cell, id}: {cell: ContractFullCell; id: bigint}) => {
		const {x, y} = bigIntIDToXY(id);

		const accountIndex = accounts.indexOf(cell.owner);

		const processedCell = {
			x,
			y,
			lastEpochUpdate: cell.lastEpochUpdate,
			epochWhenTokenIsAdded: cell.epochWhenTokenIsAdded,
			color: cell.color,
			life: cell.life,
			delta: cell.delta,
			enemyMap: cell.enemyMap,
			owner:
				cell.owner == zeroAddress
					? undefined
					: accountIndex >= 0
						? accountIndex
						: cell.owner.toLowerCase() === '0xffffffffffffffffffffffffffffffffffffffff'
							? -cell.stake
							: undefined,
			stake: cell.stake,
		};

		// console.log(`--------------`);
		// console.log(cell);
		// console.log(`------------- processed cell from contract`);
		// console.log(processedCell);
		// console.log(`--------------`);
		return processedCell;
	};
}

// console.log(
// 	renderGrid({
// 		cells: [
// 			{
// 				x: 1,
// 				y: 2,
// 				color: Color.Red,
// 				delta: 0,
// 				enemyMap: 0,
// 				epochWhenTokenIsAdded: 1,
// 				lastEpochUpdate: 1,
// 				life: 1,
// 				owner: 1,
// 			},
// 		],
// 		width: 5,
// 		height: 5,
// 	})
// );
// const grid = `
//     -------------------------
//     |    |    |    |    |    |
//     |    |    |    |    |    |
//     -------------------------
//     |    |    |    |    |    |
//     |    |    |    |    |    |
//     -------------------------
//     |    | R1 | B2 |    |    |
//     |    | 01 | 02 |    |    |
//     -------------------------
//     |    |    |    | P1 |    |
//     |    |    |    | 01 |    |
//     -------------------------
//     |    |    |    |    |    |
//     |    |    |    |    |    |
//     -------------------------
// `;

// console.log(renderGrid(parseGrid(grid)));

// console.log(
// 	renderGrid(
// 		parseGrid(
// 			renderGrid({
// 				cells: [
// 					{
// 						x: 1,
// 						y: 2,
// 						color: Color.Red,
// 						delta: 0,
// 						enemyMap: 0,
// 						epochWhenTokenIsAdded: 1,
// 						lastEpochUpdate: 1,
// 						life: 1,
// 						owner: 2,
// 					},
// 				],
// 				width: 5,
// 				height: 5,
// 			})
// 		)
// 	)
// );
