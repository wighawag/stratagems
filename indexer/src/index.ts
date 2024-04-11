import type {MergedAbis, JSProcessor, EventWithArgs} from 'ethereum-indexer-js-processor';
import {fromJSProcessor} from 'ethereum-indexer-js-processor';
import contractsInfo from './contracts';
import {Color, ContractCell, StratagemsContract, bigIntIDToXY} from 'stratagems-common';

export type CellPlacements = {
	players: {color: Color; address: string}[];
};

export type SharedRatePerAccount = {
	points: bigint;
	totalRewardPerPointAccounted: bigint;
	rewardsToWithdraw: bigint;
};

export type FixedRatePerAccount = {
	toWithdraw: bigint;
	lastTime: number;
};

export type GlobalRate = {
	lastUpdateTime: number;
	totalRewardPerPointAtLastUpdate: bigint;
	totalPoints: bigint;
};

export type EpochPlacements = {
	epoch: number;
	cells: {
		[position: string]: CellPlacements;
	};
};

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
	placements: EpochPlacements[];
	points: {
		global: GlobalRate;
		fixed: {
			[address: string]: FixedRatePerAccount;
		};
		shared: {
			[address: string]: SharedRatePerAccount;
		};
	};
	computedPoints: {[player: string]: number};
};

type ContractsABI = MergedAbis<typeof contractsInfo.contracts>;

const StratagemsIndexerProcessor: JSProcessor<ContractsABI, Data> = {
	// version is automatically populated via version.cjs to let the browser knows to reindex on changes
	version: '__VERSION_HASH__', //
	construct(): Data {
		return {
			cells: {},
			owners: {},
			commitments: {},
			placements: [],
			points: {
				global: {lastUpdateTime: 0, totalRewardPerPointAtLastUpdate: 0n, totalPoints: 0n},
				fixed: {},
				shared: {},
			},
			computedPoints: {},
		};
	},
	onCommitmentRevealed(state, event) {
		const epoch = event.args.epoch;
		const account = event.args.player.toLowerCase();

		let epochEvents = state.placements.find((v) => v.epoch === event.args.epoch);
		if (!epochEvents) {
			epochEvents = {
				epoch,
				cells: {},
			};
			state.placements.unshift(epochEvents);
			if (state.placements.length > 7) {
				state.placements.pop();
			}
		}

		const stratagemsContract = new StratagemsContract(state, 7);
		for (const move of event.args.moves) {
			stratagemsContract.computeMove(event.args.player, event.args.epoch, move);

			let cell = epochEvents.cells[move.position.toString()];
			if (!cell) {
				epochEvents.cells[move.position.toString()] = cell = {
					players: [],
				};
			}
			cell.players.push({
				color: move.color,
				address: account,
			});
		}

		// TODO only keep track of the connected player ?
		delete state.commitments[account];
	},
	onSinglePoke(state, event) {
		const stratagemsContract = new StratagemsContract(state, 7);
		stratagemsContract.poke(event.args.position, event.args.epoch);
	},
	onMultiPoke(state, event) {
		const stratagemsContract = new StratagemsContract(state, 7);
		for (const position of event.args.positions) {
			// console.log({position: position, pos: bigIntIDToXY(position)});
			stratagemsContract.poke(position, event.args.epoch);
		}
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
	// onTimeIncreased(state, event) {},

	// --------------------------

	onForceSimpleCells(state, event) {
		const stratagemsContract = new StratagemsContract(state, 7);
		stratagemsContract.forceSimpleCells(event.args.epoch, event.args.cells as any);
	},

	onAccounFixedRewardUpdated(state, event) {
		state.points.fixed[event.args.account] = event.args.fixedRateStatus;
	},

	onAccountSharedRewardUpdated(state, event) {
		state.points.shared[event.args.account] = event.args.sharedRateStatus;
	},

	onGlobalRewardUpdated(state, event) {
		state.points.global = event.args.globalStatus;
	},
};

export const createProcessor = fromJSProcessor(() => StratagemsIndexerProcessor);
