/**
 * Clicks into planned moves, by stratagems' rules.
 *
 * WHAT A CLICK MAY PLAN is the contract's rule since step 10b (P1 of the plan):
 * a cell ALIVE at the cycle's start and owned by another player (or Evil) is
 * "already there" and a move onto it would be skipped, so it is not offered; a
 * dead cell, anyone's, is free; the player's own living cell may be re-placed.
 * "At the cycle's start" is the board as the indexer holds it: during the commit
 * phase no reveal of the cycle has landed, so that board IS the cycle's start.
 *
 * WHAT A CLICK MEANS (P6 of step 6c): on a cell planned this turn, take it back;
 * on a cell the rule allows, plan it in the player's faction; on the player's
 * own full-life cell, select it, and the cell panel offers its removal (the land
 * menu, a `Color.None` move, which returns the gem); on any other cell, select
 * it, and the cell panel says why it cannot be played. Every click selects the
 * cell it landed on, so the panel always describes the last cell touched.
 *
 * The contract would also take a colour on the player's own full-life cell (a
 * re-placement, which resets its life to 2 and its stake to 1). Not offered:
 * that is a loss the player is unlikely to mean, and the legacy client did not
 * offer it on a click either.
 */
import {derived, get, writable, type Readable} from 'svelte/store';
import {
	Color,
	EVIL_OWNER_ADDRESS,
	StratagemsContract,
	type ContractCell,
} from 'stratagems-common';
import type {SubmissionState, SubmissionStore} from '$lib/game/core/submission';
import type {OnchainStateStore, OnchainStateValue} from '$lib/game/core/seams';
import type {GameIdentity} from '$lib/game/identity';
import type {BoardState} from './board/indexed-board';
import type {Move} from './moves';
import {MAX_MOVES_PER_TURN} from './game-config';
import type {LocalPlan} from './view';

export function isPlannable(state: SubmissionState<Move>): boolean {
	return (
		state.step === 'Idle' ||
		state.step === 'Planning' ||
		state.step === 'Revealed' ||
		state.step === 'Missed' ||
		(state.step === 'Error' && state.during === 'commit')
	);
}

function movesOf(state: SubmissionState<Move>): readonly Move[] {
	return 'actions' in state ? state.actions : [];
}

/** What the rule says a player may do with one cell. */
export type CellJudgement =
	/** Empty or dead at the cycle's start: anyone's to place on. */
	| {kind: 'place'}
	/** The player's own living cell, below full life: re-placed by a click. */
	| {kind: 'replace'}
	/** The player's own cell at full life: the only move is its removal. */
	| {kind: 'remove'}
	/** Not the player's to act on this cycle, and why. */
	| {kind: 'refused'; reason: string};

export const REFUSED_EVIL =
	'An Evil cell. Nobody can play on it until it dies.';
export const REFUSED_OTHERS =
	"Another player's living cell. It is theirs this cycle; it becomes free once it dies.";

/**
 * What `player` may do with the cell at `position`, judged on `board` (the
 * cycle's start). Pure, so the rule is testable without a chain.
 */
export function judgeCell(params: {
	board: BoardState;
	position: bigint;
	player: `0x${string}`;
	maxLife: number;
}): CellJudgement {
	const {board, position} = params;
	const key = position.toString();
	const raw: ContractCell | undefined = board.data.cells[key];
	if (!raw) return {kind: 'place'};
	const simulation = new StratagemsContract(
		{
			cells: {[key]: {...raw}},
			owners: {},
			computedPoints: {},
		},
		params.maxLife,
	);
	const {updatedCell} = simulation.getUpdatedCell(position, board.cycleNumber);
	if (updatedCell.life === 0) return {kind: 'place'};
	const owner = board.data.owners[key]?.toLowerCase();
	if (
		updatedCell.color === Color.Evil ||
		owner === EVIL_OWNER_ADDRESS.toLowerCase()
	) {
		return {kind: 'refused', reason: REFUSED_EVIL};
	}
	if (owner !== params.player.toLowerCase()) {
		return {kind: 'refused', reason: REFUSED_OTHERS};
	}
	return updatedCell.life < params.maxLife
		? {kind: 'replace'}
		: {kind: 'remove'};
}

/** Whether `player` may plan a coloured move on `position` (a click plans it). */
export function canPlaceOn(params: {
	board: BoardState;
	position: bigint;
	player: `0x${string}`;
	maxLife: number;
}): boolean {
	const {kind} = judgeCell(params);
	return kind === 'place' || kind === 'replace';
}

export const REFUSED_COMMITTED =
	'Your turn is already committed. Plan again once it is revealed.';
export const REFUSED_LIMIT = 'That is as many moves as one turn can hold.';

/** The cell the player last clicked, and what may be done with it. */
export type SelectedCell = {
	position: bigint;
	judgement?: CellJudgement;
	/** Why the last click on it planned nothing, when it did not. */
	reason?: string;
	/** A move on it is planned this turn, and its colour. */
	planned?: number;
	/** Its removal can be planned now (the land menu's one action). */
	canRemove: boolean;
};

export type PlanningStore = {
	plan: Readable<LocalPlan>;
	actions: Readable<readonly Move[]>;
	canPlan: Readable<boolean>;
	count: Readable<number>;
	maxActions: Readable<number | undefined>;
	atLimit: Readable<boolean>;
	/** The last cell clicked, described. */
	selected: Readable<SelectedCell | undefined>;
	/** What a click on the cell at `position` means (see the file's note). */
	click(position: bigint): void;
	/** Plan the removal of the player's own full-life cell. */
	remove(position: bigint): void;
	deselect(): void;
	clear(): void;
};

export function createPlanning(params: {
	submission: SubmissionStore<GameIdentity, Move>;
	maxOpenableActions: Readable<number | undefined>;
	onchainState: OnchainStateStore<BoardState>;
	identity: Readable<GameIdentity | undefined>;
	/** The colour a placement takes: the player's faction. */
	faction: Readable<number | undefined>;
	maxLife: number;
}): PlanningStore {
	const {submission, onchainState, identity} = params;
	const board: Readable<OnchainStateValue<BoardState>> = {
		subscribe: onchainState.subscribe,
	};

	const maxActions = derived(params.maxOpenableActions, ($max) =>
		$max === undefined
			? MAX_MOVES_PER_TURN
			: Math.min($max, MAX_MOVES_PER_TURN),
	);

	const actions = derived(submission, ($submission) => movesOf($submission));
	const plan = derived(
		[actions, identity],
		([$actions, $identity]): LocalPlan => ({
			planned: $actions,
			player: $identity,
		}),
	);
	const canPlan = derived(submission, ($submission) =>
		isPlannable($submission),
	);
	const count = derived(actions, ($actions) => $actions.length);
	const atLimit = derived(
		[count, maxActions],
		([$count, $max]) => $count >= $max,
	);

	const selection = writable<{position: bigint; reason?: string} | undefined>(
		undefined,
	);

	function judge(
		position: bigint,
		$board: OnchainStateValue<BoardState>,
		player: GameIdentity | undefined,
	): CellJudgement | undefined {
		if (!player || $board.step !== 'Loaded') return undefined;
		return judgeCell({
			board: $board,
			position,
			player,
			maxLife: params.maxLife,
		});
	}

	const selected = derived(
		[selection, board, identity, submission, atLimit],
		([$selection, $board, $identity, $submission, $atLimit]):
			SelectedCell | undefined => {
			if (!$selection) return undefined;
			const {position} = $selection;
			const judgement = judge(position, $board, $identity);
			const planned = movesOf($submission).find(
				(move) => move.position === position,
			)?.color;
			return {
				position,
				judgement,
				reason: $selection.reason,
				planned,
				canRemove:
					judgement?.kind === 'remove' &&
					planned === undefined &&
					isPlannable($submission) &&
					!$atLimit,
			};
		},
	);

	function refuse(position: bigint, reason: string) {
		selection.set({position, reason});
	}

	function click(position: bigint) {
		const player = get(identity);
		if (!player) return;
		if (!isPlannable(submission.value)) {
			refuse(position, REFUSED_COMMITTED);
			return;
		}
		const current = movesOf(submission.value);
		const without = current.filter((move) => move.position !== position);
		if (without.length !== current.length) {
			submission.plan(without);
			selection.set({position});
			return;
		}
		const judgement = judge(position, get(board), player);
		if (!judgement) return;
		if (judgement.kind === 'refused') {
			refuse(position, judgement.reason);
			return;
		}
		if (judgement.kind === 'remove') {
			// the land menu: the panel offers the removal
			selection.set({position});
			return;
		}
		if (current.length >= get(maxActions)) {
			refuse(position, REFUSED_LIMIT);
			return;
		}
		const color = get(params.faction);
		if (color === undefined) return;
		submission.plan([...current, {position, color}]);
		selection.set({position});
	}

	function remove(position: bigint) {
		const player = get(identity);
		if (!player || !isPlannable(submission.value)) return;
		if (judge(position, get(board), player)?.kind !== 'remove') return;
		const current = movesOf(submission.value);
		if (current.some((move) => move.position === position)) return;
		if (current.length >= get(maxActions)) {
			refuse(position, REFUSED_LIMIT);
			return;
		}
		submission.plan([...current, {position, color: Color.None}]);
		selection.set({position});
	}

	function clear() {
		if (!isPlannable(submission.value)) return;
		submission.plan([]);
	}

	return {
		plan,
		actions,
		canPlan,
		count,
		maxActions,
		atLimit,
		selected,
		click,
		remove,
		deselect: () => selection.set(undefined),
		clear,
	};
}
