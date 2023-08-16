import type {MergedAbis, JSProcessor, EventWithArgs} from 'ethereum-indexer-js-processor';
import {fromJSProcessor} from 'ethereum-indexer-js-processor';
import contractsInfo from './contracts';
import {Color} from 'stratagems-common';

// you declare the types for your in-browswe DB.
export type Data = {
	cells: {
		[position: string]: {
			position: bigint;
			lastEpochUpdate: number;
			epochWhenTokenIsAdded: number;
			color: Color;
			life: number;
			delta: number;
			enemymask: number;
			owner: `0x${string}`;
			stake: number;
		};
	};
};

type ContractsABI = MergedAbis<typeof contractsInfo.contracts>;

function test(state: Data, event: EventWithArgs<ContractsABI, 'CommitmentResolved'>) {}

const StratagemsIndexerProcessor: JSProcessor<ContractsABI, Data> = {
	// version is automatically populated via version.cjs to let the browser knows to reindex on changes
	version: '__VERSION_HASH__',
	construct(): Data {
		return {cells: {}};
	},
	onCommitmentResolved(state, event) {
		test(state, event);
		for (const move of event.args.moves) {
			const id = move.position.toString();
			const existingCell = state.cells[id];

			if (existingCell) {
				existingCell.color = move.color;
			} else {
				state.cells[id] = {
					position: move.position,
					color: move.color,
					delta: 0,
					enemymask: 0,
					lifeToCome: 0,
					owner: event.args.player,
					stake: 1,
				};
			}
		}
	},
	onCommitmentCancelled(state, event) {},
	onCommitmentMade(state, event) {},
	onCommitmentVoid(state, event) {},
	onReserveDeposited(state, event) {},
	onReserveWithdrawn(state, event) {},
	onTimeIncreased(state, event) {},
};

export const createProcessor = fromJSProcessor(() => StratagemsIndexerProcessor);
