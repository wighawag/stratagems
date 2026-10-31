/**
 * THE SYNCING INDICATOR (P4 of step 6c in work/plans/join-template-commit-reveal.md):
 * what the indexer worker is doing, in the player's words, while the board is
 * not yet the chain's latest. The legacy `ui/components/SyncingInfo.svelte`
 * onto the worker's own progress (`HostProgress`, which `board/indexed-board.ts`
 * exposes as `progress`).
 *
 * Nothing is shown at the tip: a board that is current needs no caption.
 */
import {derived, type Readable} from 'svelte/store';
import type {HostProgress} from '@etherfold/browser';

export type SyncingModel =
	| undefined
	| {
			label: string;
			/** 0..100, when the worker knows how far it is. */
			percentage?: number;
			failed?: boolean;
	  };

export function describeSyncing(
	progress: HostProgress | undefined,
): SyncingModel {
	if (!progress) return {label: 'Starting the indexer...'};
	if (progress.failure) {
		return {label: 'The indexer stopped. Reload to try again.', failed: true};
	}
	switch (progress.phase) {
		case 'at-tip':
			return undefined;
		case 'waiting':
			return {label: 'Waiting for the chain...'};
		case 'loading':
			return {label: 'Loading the board...'};
		case 'refused':
			return {
				label: 'The indexer refused this tab. Reload to try again.',
				failed: true,
			};
		case 'catching-up': {
			const percentage =
				progress.syncPercentage === undefined
					? undefined
					: Math.max(0, Math.min(100, Math.floor(progress.syncPercentage)));
			const behind = progress.blocksBehindTip;
			return {
				label:
					behind !== undefined
						? `Indexing the board: ${behind} block${behind === 1 ? '' : 's'} behind`
						: 'Indexing the board...',
				percentage,
			};
		}
		default:
			return {label: 'Indexing the board...'};
	}
}

export function createSyncing(
	progress: Readable<HostProgress | undefined>,
): Readable<SyncingModel> {
	return derived(progress, describeSyncing);
}

/**
 * The word over the board while the indexed board is not loaded yet (step 9,
 * P9-8): the board already shows its wood and lines, and this says why it is
 * empty. The indexer's own word when it has one, else that it is loading.
 */
export function boardLoadingWord(params: {
	loaded: boolean;
	syncing: SyncingModel;
}): {label: string; failed: boolean} | undefined {
	if (params.loaded) return undefined;
	return {
		label: params.syncing?.label ?? 'Loading the board...',
		failed: params.syncing?.failed ?? false,
	};
}
