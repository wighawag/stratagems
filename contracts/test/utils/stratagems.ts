import artifacts from '../../generated/artifacts';
import {parseGrid, toContractCell} from 'stratagems-common';
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
	return env.Stratagems.write.forceSimpleCells([grid.cells.map(toContractCell(env.otherAccounts))], {
		account: env.stratagemsAdmin,
	});
}
