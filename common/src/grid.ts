import {zeroAddress} from 'viem';

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

export function xyToXYID(x: number, y: number) {
	return '' + x + ',' + y;
}

export function xyToBigIntID(x: number, y: number): bigint {
	const bn = BigInt.asUintN(32, BigInt(x)) + (BigInt.asUintN(32, BigInt(y)) << 32n);
	return bn;
}

enum Color {
	None,
	Blue,
	Red,
	Green,
	Yellow,
	Purple,
}

export type Grid = {
	cells: Cell[];
	width: number;
	height: number;
};

export type ContractCell = {
	position: bigint;
	owner: `0x${string}`;
	color: 0 | 1 | 2 | 3 | 4 | 5;
	life: number;
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
		case Color.None:
			return ' ';
	}
}

function emptyCell(x: number, y: number): TmpCell {
	return {
		empty: true,
		playerAsString: '',
		x,
		y,
		color: Color.None,
		delta: 0,
		enemymask: 0,
		epochWhenTokenIsAdded: 0,
		lastEpochUpdate: 0,
		life: 0,
		owner: undefined,
	};
}

export type Cell = {
	x: number;
	y: number;
	lastEpochUpdate: number;
	epochWhenTokenIsAdded: number;
	color: Color;
	life: number;
	delta: number;
	enemymask: number;
	owner?: number;
};

type TmpCell = Cell & {
	empty: boolean;
	playerAsString: string;
};

export function parseGrid(str: string): Grid {
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
					cell = emptyCell(x, y);
					tmpCellMap.set(cellID(x, y), cell);
				}
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
					}
				} else {
					if (char != ' ') {
						cell.playerAsString += char;
					}
				}
			}
		}
		charI++;
	}

	const cells: Cell[] = [];
	for (const cell of tmpCellMap.values()) {
		if (!cell.empty) {
			const {empty, playerAsString, ...onlyCell} = cell;
			if (playerAsString !== '') {
				const ownerNumber = parseInt(playerAsString);
				onlyCell.owner = ownerNumber;
			}
			cells.push(onlyCell);
		}
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
					if (cell) {
						if (r == 0) {
							str += ' ';
							str += colorCodeOf(cell.color);
							str += cell.life.toString();
							str += ' ';
						} else {
							if (typeof cell.owner !== 'undefined') {
								str += ` ${cell.owner.toString().padStart(2, '0')} `;
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

export function toContractCell(accounts: `0x${string}`[]): (cell: Cell) => ContractCell {
	return (cell: Cell) => ({
		color: cell.color,
		life: cell.life,
		owner: cell.owner ? accounts[cell.owner] : zeroAddress,
		position: xyToBigIntID(cell.x, cell.y),
	});
}

// console.log(
// 	renderGrid({
// 		cells: [
// 			{
// 				x: 1,
// 				y: 2,
// 				color: Color.Red,
// 				delta: 0,
// 				enemymask: 0,
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
//     |    |    |    |    |    |
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
// 						enemymask: 0,
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
