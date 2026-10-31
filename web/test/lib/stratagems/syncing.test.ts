import {describe, expect, it} from 'vitest';
import type {HostProgress} from '@etherfold/browser';
import {describeSyncing} from '$lib/stratagems/syncing';

const progress = (fields: Partial<HostProgress>) =>
	({
		host: 'dedicated-worker',
		scope: '',
		indexing: true,
		phase: 'loading',
		...fields,
	}) as HostProgress;

describe('the syncing indicator', () => {
	it('says nothing at the tip', () => {
		expect(describeSyncing(progress({phase: 'at-tip'}))).toBeUndefined();
	});

	it('says how far behind the board is while catching up', () => {
		expect(
			describeSyncing(
				progress({
					phase: 'catching-up',
					blocksBehindTip: 12,
					syncPercentage: 42.7,
				}),
			),
		).toEqual({label: 'Indexing the board: 12 blocks behind', percentage: 42});
		expect(
			describeSyncing(progress({phase: 'catching-up', blocksBehindTip: 1})),
		).toEqual({
			label: 'Indexing the board: 1 block behind',
			percentage: undefined,
		});
	});

	it('names the waits before the fold, and a stopped indexer as a failure', () => {
		expect(describeSyncing(undefined)?.label).toBe('Starting the indexer...');
		expect(describeSyncing(progress({phase: 'waiting'}))?.label).toBe(
			'Waiting for the chain...',
		);
		expect(describeSyncing(progress({phase: 'loading'}))?.label).toBe(
			'Loading the board...',
		);
		expect(describeSyncing(progress({phase: 'refused'}))?.failed).toBe(true);
		expect(
			describeSyncing(
				progress({phase: 'catching-up', failure: {message: 'x'} as never}),
			)?.failed,
		).toBe(true);
	});
});

describe('the word over the board while it loads', () => {
	it("says the indexer's word until the board is loaded, then nothing", async () => {
		const {boardLoadingWord} = await import('$lib/stratagems/syncing');
		expect(
			boardLoadingWord({
				loaded: false,
				syncing: describeSyncing(
					progress({phase: 'catching-up', blocksBehindTip: 3}),
				),
			}),
		).toEqual({label: 'Indexing the board: 3 blocks behind', failed: false});
		expect(
			boardLoadingWord({
				loaded: true,
				syncing: describeSyncing(progress({phase: 'loading'})),
			}),
		).toBeUndefined();
	});

	it('says the board is loading when the indexer has nothing to say yet', async () => {
		const {boardLoadingWord} = await import('$lib/stratagems/syncing');
		expect(boardLoadingWord({loaded: false, syncing: undefined})).toEqual({
			label: 'Loading the board...',
			failed: false,
		});
	});

	it('keeps a failure red', async () => {
		const {boardLoadingWord} = await import('$lib/stratagems/syncing');
		expect(
			boardLoadingWord({
				loaded: false,
				syncing: describeSyncing(
					progress({failure: {} as HostProgress['failure']}),
				),
			}),
		).toMatchObject({failed: true});
	});
});
