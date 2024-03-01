import artifacts from '../../generated/artifacts';
import solidityKitArtifacts from 'solidity-kit/generated/artifacts';
import {
	Action,
	CellXYPosition,
	Color,
	Grid,
	ContractMove,
	fromContractFullCellToCell,
	parseGrid,
	prepareCommitment,
	randomSecret,
	toContractSimpleCell,
	xyToBigIntID,
	zeroBytes32,
	zeroBytes24,
} from 'stratagems-common';
import {ContractWithViemClient} from '../../utils/connection';
import {parseEther, zeroAddress} from 'viem';
import {EIP1193ProviderWithoutEvents} from 'eip-1193';

export type GridEnv = {
	Stratagems: ContractWithViemClient<typeof artifacts.IStratagemsWithDebug.abi>;
	TestTokens: ContractWithViemClient<typeof artifacts.TestTokens.abi>;
	GemsGenerator: ContractWithViemClient<typeof artifacts.RewardsGenerator.abi>;
	Time: ContractWithViemClient<typeof solidityKitArtifacts.Time.abi>;
	otherAccounts: `0x${string}`[];
	stratagemsAdmin: `0x${string}`;
	tokensBeneficiary: `0x${string}`;
	// deployer: `0x${string}`;
	config: {
		tokens: `0x${string}`;
		burnAddress: `0x${string}`;
		startTime: bigint;
		commitPhaseDuration: bigint;
		revealPhaseDuration: bigint;
		maxLife: number;
		numTokensPerGems: bigint;
	};
	provider: EIP1193ProviderWithoutEvents;
};

export async function withGrid(env: GridEnv, gridString: string) {
	const grid = parseGrid(gridString);
	// console.log(gridString);
	// console.log(grid.cells);
	// console.log(grid.cells.map(toContractSimpleCell(env.otherAccounts)));
	const simpleCells = grid.cells.map(toContractSimpleCell(env.otherAccounts));
	const hash = await env.Stratagems.write.forceSimpleCells([simpleCells], {
		account: env.stratagemsAdmin,
	});
	// TODO wait for receipt so the test work on real networks
	if (grid.actions) {
		const config = await env.Stratagems.read.getConfig();
		await env.Time.write.increaseTime([config.commitPhaseDuration], {account: env.stratagemsAdmin});

		for (const action of grid.actions) {
			const player = env.otherAccounts[action.owner];
			await env.Stratagems.write.forceMoves(
				[player, [{position: xyToBigIntID(action.x, action.y), color: action.color}]],
				{account: env.stratagemsAdmin},
			);
		}
		await env.Time.write.increaseTime([config.revealPhaseDuration], {account: env.stratagemsAdmin});
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
		moves: ContractMove[];
	}[] = [];
	for (const playerIndex of Object.keys(groupedActions)) {
		const player = env.otherAccounts[parseInt(playerIndex) < 0 ? 0 : playerIndex];
		// console.log({player});
		const actions = groupedActions[playerIndex];
		const moves = actions.map((action) => ({position: xyToBigIntID(action.x, action.y), color: action.color}));
		const commitment = prepareCommitment(moves, randomSecret());

		// const amountOfTokens = parseEther(`${moves.filter((move) => move.color !== Color.None).length}`);
		const amountOfTokens = parseEther(`${moves.length}`);

		// await env.TestTokens.write.transfer([player, amountOfTokens], {account: env.tokensBeneficiary});
		await env.TestTokens.write.approve([env.Stratagems.address, amountOfTokens], {account: player});
		await env.Stratagems.write.makeCommitmentWithExtraReserve(
			[commitment.hash, amountOfTokens, {deadline: 0n, value: 0n, v: 0, r: zeroBytes32, s: zeroBytes32}, zeroAddress],
			{account: player},
		);
		commitments.push({...commitment, player});
	}
	await env.Time.write.increaseTime([config.commitPhaseDuration], {account: env.stratagemsAdmin});

	for (const commitment of commitments) {
		await env.Stratagems.write.reveal(
			[commitment.player, commitment.secret, commitment.moves, zeroBytes24, true, zeroAddress],
			{
				account: env.stratagemsAdmin,
			},
		);
	}

	await env.Time.write.increaseTime([config.revealPhaseDuration], {account: env.stratagemsAdmin});
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
	},
): Promise<Grid> {
	const listOfCoords: CellXYPosition[] = [];
	for (let h = 0; h < location.height; h++) {
		for (let w = 0; w < location.width; w++) {
			listOfCoords.push({x: location.x + w, y: location.y + h});
		}
	}
	const cellIds = listOfCoords.map(({x, y}) => xyToBigIntID(x, y));
	const cellsFromContract = await env.Stratagems.read.getCells([cellIds]);
	const fullCells = cellsFromContract.map((value, index) => ({
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
