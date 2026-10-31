/**
 * THE LEADERBOARD (P3 of step 6c in work/plans/join-template-commit-reveal.md):
 * every player the rewards generator knows, from the indexer's `points`, ranked
 * by the gems they have earned, then by the points they hold, the legacy
 * `ui/leaderboard/` ported onto the composition.
 *
 * EARNED IS EXACT AS OF THE GENERATOR'S LAST UPDATE, not extrapolated to now:
 * `rewardsToWithdraw` plus what the account's points earned between its last
 * accounting and the global rate's last update (`RewardsGenerator`'s
 * `_computeRewardsEarned`, with no time term). The legacy view added the time
 * since then at a reward rate it hard-coded; the rate is the generator's
 * deploy-time configuration and is not in the deployment's linked data, so this
 * shows what the chain has accounted rather than a guess that drifts from it.
 * It moves whenever any player's points change, which is every reveal.
 *
 * `lands` counts the player's cells alive at the board's cycle.
 */
import {derived, type Readable} from 'svelte/store';
import {cellAtCycle} from 'stratagems-common';
import type {OnchainStateStore, OnchainStateValue} from '$lib/game/core/seams';
import type {GameIdentity} from '$lib/game/identity';
import type {BoardState} from './board/indexed-board';

/** `RewardsGenerator`'s constants. */
const PRECISION = 10n ** 24n;
const DECIMALS_18_MILLIONTH = 10n ** 12n;

export type LeaderboardRow = {
	player: `0x${string}`;
	/** Gems earned so far, in token units. */
	earned: bigint;
	/**
	 * Points held now: the gems staked on the player's producing cells, in
	 * token units (the game adds `NUM_TOKENS_PER_GEMS * stake` per cell).
	 */
	points: bigint;
	lands: number;
	/** The row of the player viewing. */
	mine: boolean;
};

/** The leaderboard, as of `board`. Pure. */
export function leaderboardOf(params: {
	board: BoardState;
	player?: `0x${string}`;
	maxLife: number;
}): LeaderboardRow[] {
	const {data, cycleNumber} = params.board;
	const viewer = params.player?.toLowerCase();
	const global = data.points.global;

	const lands = new Map<string, number>();
	for (const key of Object.keys(data.cells)) {
		const owner = data.owners[key]?.toLowerCase();
		if (!owner) continue;
		const {cell} = cellAtCycle(data.cells[key], cycleNumber, params.maxLife);
		if (cell.life > 0) lands.set(owner, (lands.get(owner) ?? 0) + 1);
	}

	const rows = Object.entries(data.points.shared).map(
		([account, shared]): LeaderboardRow => {
			const player = account.toLowerCase() as `0x${string}`;
			const earned =
				shared.rewardsToWithdraw +
				(shared.points *
					(global.totalRewardPerPointAtLastUpdate -
						shared.totalRewardPerPointAccounted) *
					DECIMALS_18_MILLIONTH) /
					PRECISION;
			return {
				player,
				earned,
				points: shared.points,
				lands: lands.get(player) ?? 0,
				mine: player === viewer,
			};
		},
	);
	return rows.sort((a, b) =>
		a.earned !== b.earned
			? a.earned > b.earned
				? -1
				: 1
			: a.points !== b.points
				? a.points > b.points
					? -1
					: 1
				: a.player < b.player
					? -1
					: a.player > b.player
						? 1
						: 0,
	);
}

/** Points as the player reads them: whole gems staked. */
export function pointsLabel(points: bigint, numTokensPerGems: bigint): string {
	return numTokensPerGems > 0n ? (points / numTokensPerGems).toString() : '0';
}

export function createLeaderboard(params: {
	onchainState: OnchainStateStore<BoardState>;
	identity: Readable<GameIdentity | undefined>;
	maxLife: number;
}): Readable<LeaderboardRow[]> {
	const board: Readable<OnchainStateValue<BoardState>> = {
		subscribe: params.onchainState.subscribe,
	};
	return derived([board, params.identity], ([$board, $identity]) =>
		$board.step === 'Loaded'
			? leaderboardOf({
					board: $board,
					player: $identity,
					maxLife: params.maxLife,
				})
			: [],
	);
}
