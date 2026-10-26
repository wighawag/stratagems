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
