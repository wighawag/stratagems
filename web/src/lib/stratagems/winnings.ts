/**
 * WINNINGS: the shares of dead cells owed to the player, collected with
 * `pokeMultiple` from the wallet (P7 of step 6c in
 * work/plans/join-template-commit-reveal.md). The port of the legacy view's
 * `tokensToCollect` (`state/ViewState.ts` until 6c) onto the composition.
 *
 * WHAT IS OWED, by the contract's rules (`UsingStratagemsSetters`' `_poke` and
 * `_updateCellFromNeighbor`): a cell that dies splits its stake between the
 * neighbours that were its enemies when it died, one share each, recorded as
 * its `distribution` (the enemies' sides in the high nibble, their count in the
 * low one). A share is `stake * (NUM_TOKENS_PER_GEMS / count)` and is paid to
 * the neighbour's owner when either cell is next touched: a move, a poke, or a
 * neighbour's update. A cell whose stored life is above zero but whose life at
 * the board's cycle is zero has just died and has not split yet, so its split
 * is computed here the way the contract will compute it.
 *
 * Collected by poking the PLAYER'S cells, as the legacy client did: a poke of a
 * cell collects every share its dead neighbours owe it, for its owner.
 *
 * Judged on the board as the indexer holds it (the latest, not the held view),
 * at the board's cycle, which is the cycle the next poke lands in unless the
 * cycle turns over first. The owner read is the current one, where the contract
 * pays the owner at the cycle's start: the two differ only for a cell changed
 * hands in this very cycle, which a display can live with.
 */
import {derived, get, writable, type Readable} from 'svelte/store';
import {
	bigIntIDToXY,
	countBits,
	StratagemsContract,
	xyToBigIntID,
} from 'stratagems-common';
import type {Abi} from 'viem';
import type {OnchainStateStore, OnchainStateValue} from '$lib/game/core/seams';
import type {GameIdentity} from '$lib/game/identity';
import type {BoardState} from './board/indexed-board';
import {errorMessage, type WalletActionState, type WalletSend} from './wallet';

/** One share owed to the player: `amount` from the dead cell `from` to their `position`. */
export type Share = {position: bigint; from: bigint; amount: bigint};

/** The neighbour on each side, in the contract's side order (its enemy-map bits). */
function neighbourOn(position: bigint, side: number): bigint {
	const {x, y} = bigIntIDToXY(position);
	switch (side) {
		case 0:
			return xyToBigIntID(x, y - 1); // up
		case 1:
			return xyToBigIntID(x - 1, y); // left
		case 2:
			return xyToBigIntID(x, y + 1); // down
		default:
			return xyToBigIntID(x + 1, y); // right
	}
}

/** Every share the board owes `player`. Pure. */
export function sharesOwed(params: {
	board: BoardState;
	player: `0x${string}`;
	numTokensPerGems: bigint;
	maxLife: number;
}): Share[] {
	const {board, numTokensPerGems} = params;
	const player = params.player.toLowerCase();
	const simulation = new StratagemsContract(
		{cells: board.data.cells, owners: {}, computedPoints: {}},
		params.maxLife,
	);
	const shares: Share[] = [];
	for (const key of Object.keys(board.data.cells)) {
		const position = BigInt(key);
		const {updatedCell, justDied} = simulation.getUpdatedCell(
			position,
			board.cycleNumber,
		);
		const distribution = justDied
			? (updatedCell.enemyMap << 4) + countBits(updatedCell.enemyMap)
			: updatedCell.distribution;
		const count = distribution & 0x0f;
		if (count === 0 || distribution >> 4 === 0 || updatedCell.stake === 0) {
			continue;
		}
		const amount =
			BigInt(updatedCell.stake) * (numTokensPerGems / BigInt(count));
		for (let side = 0; side < 4; side++) {
			if (((distribution >> 4) & (1 << side)) === 0) continue;
			const neighbour = neighbourOn(position, side);
			const owner = board.data.owners[neighbour.toString()]?.toLowerCase();
			if (owner === player) {
				shares.push({position: neighbour, from: position, amount});
			}
		}
	}
	return shares;
}

/** The player's cells to poke to collect `shares`, each once, in board order. */
export function positionsToPoke(shares: readonly Share[]): bigint[] {
	const seen = new Set<bigint>();
	for (const share of shares) seen.add(share.position);
	return [...seen];
}

export type WinningsState = {
	shares: Share[];
	total: bigint;
	collecting: WalletActionState;
};

export type WinningsStore = Readable<WinningsState> & {
	/** Poke the player's cells that are owed something, from the wallet. */
	collect(): Promise<void>;
};

export function createWinnings(params: {
	onchainState: OnchainStateStore<BoardState>;
	identity: Readable<GameIdentity | undefined>;
	numTokensPerGems: bigint;
	maxLife: number;
	game: {address: `0x${string}`; abi: Abi};
	send: WalletSend;
	/** Called once a collection landed (to refresh the board and balances). */
	onCollected?: () => void;
}): WinningsStore {
	const board: Readable<OnchainStateValue<BoardState>> = {
		subscribe: params.onchainState.subscribe,
	};
	const collecting = writable<WalletActionState>({step: 'Idle'});
	const shares = derived([board, params.identity], ([$board, $identity]) =>
		$board.step === 'Loaded' && $identity
			? sharesOwed({
					board: $board,
					player: $identity,
					numTokensPerGems: params.numTokensPerGems,
					maxLife: params.maxLife,
				})
			: [],
	);
	const state = derived(
		[shares, collecting],
		([$shares, $collecting]): WinningsState => ({
			shares: $shares,
			total: $shares.reduce((sum, share) => sum + share.amount, 0n),
			collecting: $collecting,
		}),
	);

	async function collect() {
		if (get(collecting).step === 'Sending') return;
		const positions = positionsToPoke(get(shares));
		if (positions.length === 0) return;
		collecting.set({step: 'Sending'});
		try {
			await params.send(
				{
					address: params.game.address,
					abi: params.game.abi,
					functionName: 'pokeMultiple',
					args: [positions],
				},
				'Collecting your winnings',
			);
			collecting.set({step: 'Idle'});
			params.onCollected?.();
		} catch (error) {
			collecting.set({step: 'Error', message: errorMessage(error)});
		}
	}

	return {subscribe: state.subscribe, collect};
}
