import artifacts from '../../generated/artifacts';
import {
	CellPosition,
	Grid,
	fromContractFullCellToCell,
	parseGrid,
	toContractSimpleCell,
	xyToBigIntID,
} from 'stratagems-common';
import {ContractWithViemClient} from '../../utils/viem';

export type GridEnv = {
	Stratagems: ContractWithViemClient<typeof artifacts.IStratagemsWithDebug.abi>;
	otherAccounts: `0x${string}`[];
	stratagemsAdmin: `0x${string}`;
};

export async function withGrid(env: GridEnv, gridString: string) {
	const grid = parseGrid(gridString);
	const hash = await env.Stratagems.write.forceSimpleCells([grid.cells.map(toContractSimpleCell(env.otherAccounts))], {
		account: env.stratagemsAdmin,
	});
	// TODO wait for receipt so the test work on real networks
	if (grid.actions) {
		const config = await env.Stratagems.read.getConfig();
		await env.Stratagems.write.increaseTime([config.commitPhaseDuration], {account: env.stratagemsAdmin});

		for (const action of grid.actions) {
			const player = env.otherAccounts[action.owner];
			await env.Stratagems.write.forceMoves(
				[player, [{position: xyToBigIntID(action.x, action.y), color: action.color}]],
				{account: env.stratagemsAdmin}
			);
		}
		await env.Stratagems.write.increaseTime([config.resolutionPhaseDuration], {account: env.stratagemsAdmin});
	}
}

export async function performGridActions(env: GridEnv, actionGrids: {player: number; grid: string}[]) {
	const config = await env.Stratagems.read.getConfig();

	for (const actionGrid of actionGrids) {
		const player = env.otherAccounts[actionGrid.player];
		// await env.Stratagems.write.forceMoves(
		// 	[player, [{position: xyToBigIntID(action.x, action.y), color: action.color}]],
		// 	{account: env.stratagemsAdmin}
		// );
	}
	await env.Stratagems.write.increaseTime([config.commitPhaseDuration], {account: env.stratagemsAdmin});

	for (const actionGrid of actionGrids) {
		const player = env.otherAccounts[actionGrid.player];
		const grid = parseGrid(actionGrid.grid, actionGrid.player);
		if (grid.actions) {
			await env.Stratagems.write.forceMoves(
				[player, grid.actions.map((action) => ({position: xyToBigIntID(action.x, action.y), color: action.color}))],
				{account: env.stratagemsAdmin}
			);
		}
	}
	await env.Stratagems.write.increaseTime([config.resolutionPhaseDuration], {account: env.stratagemsAdmin});
}

export async function getGrid(
	env: {
		Stratagems: ContractWithViemClient<typeof artifacts.IStratagemsWithDebug.abi>;
		otherAccounts: `0x${string}`[];
	},
	location: {
		x: number;
		y: number;
		width: number;
		height: number;
	}
): Promise<Grid> {
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

	const cells = fullCells.map(fromContractFullCellToCell(env.otherAccounts)).filter((v) => !!v.owner);

	return {
		cells,
		height: location.height,
		width: location.width,
	};
}
