/**
 * What stratagems' own HUD panels show (step 6c of
 * work/plans/join-template-commit-reveal.md): the cell panel (the legacy
 * InfoBar's cell half and the land menu), winnings, the leaderboard and test
 * gems. Pure functions from the game's stores to finished models, so the
 * components lay them out and decide nothing (AGENTS.md's Svelte conventions).
 */
import {formatUnits} from 'viem';
import {bigIntIDToXY, EVIL_OWNER_ADDRESS} from 'stratagems-common';
import type {ViewStateValue} from '$lib/game/core/seams';
import type {SelectedCell} from '../planning';
import type {BoardView} from '../view';
import type {WinningsState} from '../winnings';
import {pointsLabel, type LeaderboardRow} from '../leaderboard';
import type {TestGemsState} from '../test-gems';
import {TOPUP_GEMS} from '../test-gems';
import {COLOURS} from '../faction';

export function shortAddress(address: string): string {
	return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export type CellPanelModel = {
	title: string;
	/** The colour's name and hue, absent for an empty cell. */
	colour?: {name: string; hex: string};
	/** `life of maxLife`, or `dead`, or `empty`. */
	lifeLabel: string;
	stakeLabel?: string;
	ownerLabel?: string;
	/** What is planned on it this turn. */
	plannedLabel?: string;
	/** Why a click on it planned nothing. */
	reason?: string;
	/** The land menu's action: remove the player's own full-life cell. */
	canRemove: boolean;
};

export function describeCell(params: {
	selected: SelectedCell | undefined;
	view: ViewStateValue<BoardView>;
	maxLife: number;
}): CellPanelModel | undefined {
	const {selected, view} = params;
	if (!selected) return undefined;
	const {x, y} = bigIntIDToXY(selected.position);
	const cell =
		view.step === 'Loaded'
			? view.cells.get(selected.position.toString())
			: undefined;
	// the cell as the board shows it, so with the planned turn played onto it
	const shown = cell;
	const alive = shown !== undefined && shown.life > 0 && shown.color > 0;
	const owner = shown?.owner;
	const plannedLabel =
		selected.planned === undefined
			? undefined
			: selected.planned === 0
				? 'Planned: remove it (its gem comes back)'
				: `Planned: a ${COLOURS[selected.planned]?.name ?? '?'} gem`;
	return {
		title:
			selected.planned === undefined
				? `Cell ${x},${y}`
				: `Cell ${x},${y}, as planned`,
		colour: alive ? COLOURS[shown.color] : undefined,
		lifeLabel: alive
			? `life ${shown.life} of ${params.maxLife}`
			: shown && shown.color > 0
				? 'dead'
				: view.step === 'Loaded'
					? 'empty'
					: 'loading',
		stakeLabel: alive
			? `${shown.stake} gem${shown.stake === 1 ? '' : 's'} at stake`
			: undefined,
		ownerLabel: alive
			? shown.mine
				? 'yours'
				: owner?.toLowerCase() === EVIL_OWNER_ADDRESS.toLowerCase()
					? 'nobody (Evil)'
					: owner
						? shortAddress(owner)
						: undefined
			: undefined,
		plannedLabel,
		reason:
			selected.reason ??
			(selected.judgement?.kind === 'refused' && selected.planned === undefined
				? selected.judgement.reason
				: undefined),
		canRemove: selected.canRemove,
	};
}

export type WinningsModel =
	| undefined
	| {
			label: string;
			cells: number;
			busy: boolean;
			error?: string;
	  };

export function describeWinnings(
	state: WinningsState,
	currency: {symbol: string; decimals: number},
): WinningsModel {
	if (state.total === 0n) return undefined;
	const cells = new Set(state.shares.map((share) => share.position)).size;
	return {
		label: `${formatUnits(state.total, currency.decimals)} ${currency.symbol} to collect`,
		cells,
		busy: state.collecting.step === 'Sending',
		error:
			state.collecting.step === 'Error' ? state.collecting.message : undefined,
	};
}

export type LeaderboardModelRow = {
	rank: number;
	player: string;
	earned: string;
	points: string;
	lands: number;
	mine: boolean;
};

export function describeLeaderboard(
	rows: readonly LeaderboardRow[],
	params: {decimals: number; numTokensPerGems: bigint},
): LeaderboardModelRow[] {
	return rows.map((row, index) => ({
		rank: index + 1,
		player: row.mine ? 'you' : shortAddress(row.player),
		earned: Number(formatUnits(row.earned, params.decimals)).toFixed(2),
		points: pointsLabel(row.points, params.numTokensPerGems),
		lands: row.lands,
		mine: row.mine,
	}));
}

export type TestGemsModel =
	| undefined
	| {
			label: string;
			busy: boolean;
			/** Said when the wallet holds too few gems to stake. */
			hint?: string;
			error?: string;
	  };

export function describeTestGems(params: {
	state: TestGemsState;
	/** The wallet's gems, when read. */
	tokenBalance?: bigint;
	/** What one stake moves into the reserve. */
	stakeAmount: bigint;
	currency: {decimals: number};
}): TestGemsModel {
	const {state, tokenBalance, stakeAmount, currency} = params;
	if (!('available' in state)) return undefined;
	const gems = (value: bigint) => formatUnits(value, currency.decimals);
	return {
		label:
			state.step === 'Sending'
				? 'Getting test gems...'
				: `Get ${TOPUP_GEMS} test gems`,
		busy: state.step === 'Sending',
		// the distributor hands out less than a stake, so the numbers are said
		hint:
			tokenBalance !== undefined && tokenBalance < stakeAmount
				? `Your wallet holds ${gems(tokenBalance)} gems and a stake takes ${gems(stakeAmount)}. This deployment hands out test gems for free.`
				: undefined,
		error: state.step === 'Error' ? state.message : undefined,
	};
}
