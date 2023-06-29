import artifacts from '../../generated/artifacts';
import {
	Cell,
	CellPosition,
	ContractFullCell,
	Grid,
	SimpleCell,
	fromContractFullCell,
	parseGrid,
	toContractSimpleCell,
	xyToBigIntID,
} from 'stratagems-common';
import {ContractWithViemClient} from '../../utils/viem';

export function setupGrid(
	env: {
		Stratagems: ContractWithViemClient<typeof artifacts.IStratagemsWithDebug.abi>;
		otherAccounts: `0x${string}`[];
		stratagemsAdmin: `0x${string}`;
	},
	gridString: string
) {
	const grid = parseGrid(gridString);
	return env.Stratagems.write.forceSimpleCells([grid.cells.map(toContractSimpleCell(env.otherAccounts))], {
		account: env.stratagemsAdmin,
	});
}

export async function getGrid<CellType extends SimpleCell>(
	env: {
		Stratagems: ContractWithViemClient<typeof artifacts.IStratagemsWithDebug.abi>;
		otherAccounts: `0x${string}`[];
	},
	location: {
		x: number;
		y: number;
		width: number;
		height: number;
	},
	fromContractCell: (accounts: `0x${string}`[]) => (data: {cell: ContractFullCell; id: bigint}) => CellType
): Promise<Grid<CellType>> {
	const listOfCoords: CellPosition[] = [];
	for (let h = 0; h < location.height; h++) {
		for (let w = 0; w < location.width; w++) {
			listOfCoords.push({x: location.x + w, y: location.y + h});
		}
	}
	const cellIds = listOfCoords.map(({x, y}) => xyToBigIntID(x, y));
	const fullCells = (await env.Stratagems.read.getCells([cellIds])).map((value, index) => ({
		cell: value,
		id: cellIds[index],
	}));

	const cells = fullCells.map(fromContractCell(env.otherAccounts)).filter((v) => !!v.owner);

	return {
		cells,
		height: location.height,
		width: location.width,
	};
}
