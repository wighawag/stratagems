import type {Color, ContractCell} from 'stratagems-common';

/**
 * The shape the web app reads the state in: the old JS processor's state object,
 * kept as the shape of the ANSWER to `./queries.ts` rather than as the state
 * itself. The state is rows in a store now; this is what one read of it returns.
 */

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
	/** Newest first, at most 7, as the old processor's array was. */
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

export function emptyData(): Data {
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
}
