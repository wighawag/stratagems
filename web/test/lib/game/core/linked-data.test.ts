import {describe, expect, it} from 'vitest';
import {
	optionalBigInt,
	optionalNumber,
	readAddress,
	readBigInt,
	readNumber,
} from '$lib/game/core/linked-data';
import {resolveCycleConfig} from '$lib/game/core/cycle';

/**
 * Reading what the deployment declared.
 *
 * Every case here is one that produces NO error at the point of the mistake:
 * a number that quietly becomes NaN, a uint256 that arrives as a string, a
 * parameter that a deployment predates. They are pinned because the symptom of
 * each is somewhere else entirely - a clock that stops, a price that reverts
 * every purchase, a sentence describing rules the chain is not playing by.
 */
describe('reading a declared value', () => {
	it('takes a uint256 as the decimal string JSON carries it as', () => {
		// The common case rather than an edge one: JSON has no bigint, so
		// everything wide arrives as text and `Number()` on it silently loses
		// precision above 2^53.
		expect(readBigInt({cost: '1000000000000000000'}, 'cost')).toBe(
			1000000000000000000n,
		);
		expect(readBigInt({cost: 5}, 'cost')).toBe(5n);
		expect(readBigInt({cost: 5n}, 'cost')).toBe(5n);
	});

	it('reads a number and an address', () => {
		expect(readNumber({n: '30'}, 'n')).toBe(30);
		expect(readAddress({a: '0xabc'}, 'a')).toBe('0xabc');
	});

	it('REFUSES a required number that is absent, instead of returning NaN', () => {
		// `Number(undefined)` is NaN, and NaN propagates: every comparison against
		// it is false, so a clock built from one simply never advances and nothing
		// anywhere raises. The message has to name the parameter, because by the
		// time the symptom shows there is nothing left pointing at it.
		expect(() => readNumber({}, 'commitPhaseDuration')).toThrow(
			/commitPhaseDuration/,
		);
		expect(() => readBigInt({}, 'placementCost')).toThrow(/placementCost/);
		expect(() => readAddress({}, 'tokens')).toThrow(/tokens/);
	});

	it('treats null as absent, because that is how an unset field comes back', () => {
		expect(() => readNumber({n: null}, 'n')).toThrow();
		expect(optionalNumber({n: null}, 'n')).toBeUndefined();
	});

	it('answers "we do not know" for a parameter the deployment predates', () => {
		// NOT a default. A client that substitutes one tells the player the rules
		// of a game that is not the one they are playing, confidently and with a
		// number on it. Answering undefined lets the UI say what happened without
		// quoting a figure this build happens to believe.
		expect(optionalNumber({}, 'numMissesAllowed')).toBeUndefined();
		expect(optionalNumber({numMissesAllowed: 3}, 'numMissesAllowed')).toBe(3);
		expect(optionalBigInt({}, 'expectedWorstGasPrice')).toBeUndefined();
		expect(
			optionalBigInt({expectedWorstGasPrice: '7'}, 'expectedWorstGasPrice'),
		).toBe(7n);
	});

	it('does not mistake a legitimate zero for an absent value', () => {
		// A start time of zero and a gas price of zero are both real answers, and
		// a presence check written as `if (!value)` would turn either into
		// "missing" - which for the start time means every cycle number is wrong.
		expect(optionalNumber({startTime: 0}, 'startTime')).toBe(0);
		expect(optionalBigInt({price: 0}, 'price')).toBe(0n);
		expect(readNumber({startTime: 0}, 'startTime')).toBe(0);
	});
});

describe('the cycle config, read off the deployment', () => {
	it('is built from what the chain declared', () => {
		expect(
			resolveCycleConfig({
				commitPhaseDuration: '30',
				revealPhaseDuration: '10',
				startTime: '100',
			}),
		).toEqual({
			commitPhaseDuration: 30,
			revealPhaseDuration: 10,
			startTime: 100,
			commitTimeAllowance: 10.1,
			policy: 'timed',
		});
	});

	it('takes the cycle policy the deployment declared', () => {
		const declared = (cyclePolicy: number) =>
			resolveCycleConfig({
				commitPhaseDuration: '30',
				revealPhaseDuration: '10',
				cyclePolicy,
			}).policy;

		// The numbers are the contract's enum, so the ORDER is the thing being
		// asserted: a client that read 2 as "manual" would poll a chain that is
		// running a clock, and one that read 1 as "timed" would draw a countdown
		// against a cycle nobody is counting down.
		expect(declared(0)).toBe('timed');
		expect(declared(1)).toBe('manual');
		expect(declared(2)).toBe('hybrid');
	});

	it('refuses a policy it does not know, instead of picking one', () => {
		// A deployment newer than the build. Guessing would put the client on the
		// wrong clock silently, which costs a stake rather than a page.
		expect(() =>
			resolveCycleConfig({
				commitPhaseDuration: '30',
				revealPhaseDuration: '10',
				cyclePolicy: 7,
			}),
		).toThrow(/cyclePolicy of 7/);
	});

	it('reads a deployment older than the parameter the way it actually ran', () => {
		// Not a default: before the policy was declared there was one rule, and
		// it read the policy off the durations. Reproducing it is what keeps a
		// game deployed before this change playable; assuming `timed` instead
		// would divide by a zero-length cycle on the manual ones.
		expect(
			resolveCycleConfig({commitPhaseDuration: '30', revealPhaseDuration: '10'})
				.policy,
		).toBe('timed');
		expect(
			resolveCycleConfig({commitPhaseDuration: '0', revealPhaseDuration: '0'})
				.policy,
		).toBe('manual');
	});

	it('starts at zero when no start time was declared', () => {
		expect(
			resolveCycleConfig({commitPhaseDuration: 30, revealPhaseDuration: 10})
				.startTime,
		).toBe(0);
	});

	it('refuses to build a clock out of a missing phase duration', () => {
		// The failure this replaces had no symptom at all: a NaN duration makes
		// every comparison false, so the cycle never advances, the submission never
		// commits, and there is nothing in the console to go on.
		expect(() =>
			resolveCycleConfig({
				commitPhaseDuration: undefined,
				revealPhaseDuration: 10,
			}),
		).toThrow(/commitPhaseDuration/);
	});
});
