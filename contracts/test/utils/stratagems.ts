import artifacts from '../../generated/artifacts';
import {
	Action,
	CellPosition,
	Grid,
	Move,
	fromContractFullCellToCell,
	parseGrid,
	prepareCommitment,
	randomSecret,
	toContractSimpleCell,
	xyToBigIntID,
} from 'stratagems-common';
import {ContractWithViemClient} from '../../utils/connection';
import {parseEther} from 'viem';

const zeroBytes32 = `0x0000000000000000000000000000000000000000000000000000000000000000`;
const zeroBytes24 = `0x000000000000000000000000000000000000000000000000`;

export type GridEnv = {
	Stratagems: ContractWithViemClient<typeof artifacts.IStratagemsWithDebug.abi>;
	TestTokens: ContractWithViemClient<typeof artifacts.TestTokens.abi>;
	otherAccounts: `0x${string}`[];
	stratagemsAdmin: `0x${string}`;
	tokensBeneficiary: `0x${string}`;
	config: {
		tokens: `0x${string}`;
		burnAddress: `0x${string}`;
		startTime: bigint;
		commitPhaseDuration: bigint;
		resolutionPhaseDuration: bigint;
		maxLife: number;
		numTokensPerGems: bigint;
	};
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

export async function performGridActions(env: GridEnv, actionGrids: string[]) {
	const config = await env.Stratagems.read.getConfig();
	const groupedActions: {[playerIndex: number]: Action[]} = {};
	for (const actionGrid of actionGrids) {
		const grid = parseGrid(actionGrid);
		if (grid.actions) {
			for (const action of grid.actions) {
				groupedActions[action.owner] = groupedActions[action.owner] || [];
				groupedActions[action.owner].push(action);
			}
		}
	}

	const commitments: {
		player: `0x${string}`;
		hash: `0x${string}`;
		secret: `0x${string}`;
		moves: Move[];
	}[] = [];
	for (const playerIndex of Object.keys(groupedActions)) {
		const player = env.otherAccounts[playerIndex];
		const actions = groupedActions[playerIndex];
		const moves = actions.map((action) => ({position: xyToBigIntID(action.x, action.y), color: action.color}));
		const commitment = prepareCommitment(moves, randomSecret());
		const amountOfTokens = parseEther(`${moves.length}`);
		await env.TestTokens.write.transfer([player, amountOfTokens], {account: env.tokensBeneficiary});
		await env.TestTokens.write.approve([env.Stratagems.address, amountOfTokens], {account: player});
		await env.Stratagems.write.makeCommitmentWithExtraReserve(
			[commitment.hash, parseEther(`${moves.length}`), {deadline: 0n, value: 0n, v: 0, r: zeroBytes32, s: zeroBytes32}],
			{account: player}
		);
		commitments.push({...commitment, player});
	}
	await env.Stratagems.write.increaseTime([config.commitPhaseDuration], {account: env.stratagemsAdmin});

	for (const commitment of commitments) {
		await env.Stratagems.write.resolve([commitment.player, commitment.secret, commitment.moves, zeroBytes24, true], {
			account: env.stratagemsAdmin,
		});
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
