import {describe, expect, it} from 'vitest';
import {get, writable} from 'svelte/store';
import {latestResult, type LatestResult} from '$lib/game/simulation/latest';

/** A run whose answers the test releases by hand, in any order. */
function controlledRun<I, R>() {
	const pending: {
		input: I;
		resolve: (r: R) => void;
		reject: (e: unknown) => void;
	}[] = [];
	const run = (input: I) =>
		new Promise<R>((resolve, reject) => pending.push({input, resolve, reject}));
	return {run, pending};
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function record<I, R>(store: {
	subscribe: (run: (v: LatestResult<I, R>) => void) => () => void;
}) {
	const values: LatestResult<I, R>[] = [];
	const stop = store.subscribe((v) => values.push(v));
	return {values, stop};
}

describe('latestResult', () => {
	it('is Idle while there is nothing to run', () => {
		const input = writable<number | undefined>(undefined);
		const {run} = controlledRun<number, string>();
		const store = latestResult(input, run);
		const {values, stop} = record(store);
		expect(values.at(-1)).toEqual({step: 'Idle'});
		stop();
	});

	it('runs on each input and publishes its result', async () => {
		const input = writable<number | undefined>(1);
		const {run, pending} = controlledRun<number, string>();
		const store = latestResult(input, run);
		const {values, stop} = record(store);

		expect(values.at(-1)).toEqual({step: 'Pending', input: 1});
		pending[0].resolve('one');
		await flush();
		expect(values.at(-1)).toEqual({step: 'Ready', input: 1, result: 'one'});
		stop();
	});

	it('never publishes a result over a newer input, whatever order the runs finish in', async () => {
		const input = writable<number | undefined>(1);
		const {run, pending} = controlledRun<number, string>();
		const store = latestResult(input, run);
		const {values, stop} = record(store);

		input.set(2);
		expect(values.at(-1)).toEqual({step: 'Pending', input: 2});

		// The newer run answers first, then the stale one: the stale one is dropped.
		pending[1].resolve('two');
		await flush();
		pending[0].resolve('one');
		await flush();

		expect(values.at(-1)).toEqual({step: 'Ready', input: 2, result: 'two'});
		expect(values.some((v) => v.step === 'Ready' && v.input === 1)).toBe(false);
		stop();
	});

	it('drops a stale result even when it answers before the newer run', async () => {
		const input = writable<number | undefined>(1);
		const {run, pending} = controlledRun<number, string>();
		const store = latestResult(input, run);
		const {values, stop} = record(store);

		input.set(2);
		pending[0].resolve('one');
		await flush();
		expect(values.at(-1)).toEqual({step: 'Pending', input: 2});

		pending[1].resolve('two');
		await flush();
		expect(values.at(-1)).toEqual({step: 'Ready', input: 2, result: 'two'});
		stop();
	});

	it('reports a failed run for its input, and recovers on the next', async () => {
		const input = writable<number | undefined>(1);
		const {run, pending} = controlledRun<number, string>();
		const store = latestResult(input, run);
		const {values, stop} = record(store);

		const error = new Error('reverted');
		pending[0].reject(error);
		await flush();
		expect(values.at(-1)).toEqual({step: 'Failed', input: 1, error});

		input.set(3);
		pending[1].resolve('three');
		await flush();
		expect(values.at(-1)).toEqual({step: 'Ready', input: 3, result: 'three'});
		stop();
	});

	it('does not run again for an input equal to the last one', () => {
		const input = writable<{n: number} | undefined>({n: 1});
		const {run, pending} = controlledRun<{n: number}, string>();
		const store = latestResult(input, run, {equal: (a, b) => a.n === b.n});
		const {stop} = record(store);
		input.set({n: 1});
		expect(pending).toHaveLength(1);
		input.set({n: 2});
		expect(pending).toHaveLength(2);
		stop();
	});

	it('goes Idle again when the input does, dropping whatever was in flight', async () => {
		const input = writable<number | undefined>(1);
		const {run, pending} = controlledRun<number, string>();
		const store = latestResult(input, run);
		const {values, stop} = record(store);

		input.set(undefined);
		pending[0].resolve('one');
		await flush();
		expect(values.at(-1)).toEqual({step: 'Idle'});
		stop();
	});

	it('runs nothing while nobody is subscribed', () => {
		const input = writable<number | undefined>(1);
		const {run, pending} = controlledRun<number, string>();
		const store = latestResult(input, run);
		expect(pending).toHaveLength(0);
		expect(get(store)).toEqual({step: 'Pending', input: 1});
		expect(pending).toHaveLength(1);
	});
});
