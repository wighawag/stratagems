import type {MergedAbis, JSProcessor, EventWithArgs} from 'ethereum-indexer-js-processor';
import {fromJSProcessor} from 'ethereum-indexer-js-processor';
import contractsInfo from './contracts';
import {ContractCell, StratagemsContract} from 'stratagems-common';

export type Data = {
	cells: {
		[position: string]: ContractCell;
	};
	owners: {
		[position: string]: `0x${string}`;
	};
	commitments: {
		[address: string]: {epoch: number; hash: `0x${string}`};
	};
};

type ContractsABI = MergedAbis<typeof contractsInfo.contracts>;

const StratagemsIndexerProcessor: JSProcessor<ContractsABI, Data> = {
	// version is automatically populated via version.cjs to let the browser knows to reindex on changes
	version: '__VERSION_HASH__',
	construct(): Data {
		return {cells: {}, owners: {}, commitments: {}};
	},
	onCommitmentRevealed(state, event) {
		const account = event.args.player.toLowerCase();
		const stratagemsContract = new StratagemsContract(state, 7);
		for (const move of event.args.moves) {
			stratagemsContract.computeMove(event.args.player, event.args.epoch, move);
		}
		// TODO only keep track of the connected player ?
		delete state.commitments[account];
	},
	onCommitmentCancelled(state, event) {
		const account = event.args.player.toLowerCase();
		// TODO only keep track of the connected player ?
		delete state.commitments[account];
	},
	onCommitmentMade(state, event) {
		const account = event.args.player.toLowerCase();
		// TODO only keep track of the connected player ?
		state.commitments[account] = {epoch: event.args.epoch, hash: event.args.commitmentHash};
	},
	onCommitmentVoid(state, event) {
		const account = event.args.player.toLowerCase();
		// TODO only keep track of the connected player ?
		delete state.commitments[account];
	},
	onReserveDeposited(state, event) {},
	onReserveWithdrawn(state, event) {},
	onTimeIncreased(state, event) {},

	// --------------------------

	onForceSimpleCells(state, event) {
		const stratagemsContract = new StratagemsContract(state, 7);
		stratagemsContract.forceSimpleCells(event.args.epoch, event.args.cells);
	},
};

export const createProcessor = fromJSProcessor(() => StratagemsIndexerProcessor);
