import {describe, expect, it} from 'vitest';
import {errorSummary} from '$lib/game/core/diagnostics';

/**
 * The one-line version of an error, for scanning a trace.
 *
 * The bug this pins: plenty of failures arrive as plain objects - viem's
 * request errors, the poller's `{message, cause}` - and `String()` on those is
 * `[object Object]`. A trace line that cannot be read is one nobody reads to
 * the end, and the errors were being mangled exactly where they mattered:
 *
 *   UNHEALTHY: [object Object] (+33792ms)
 *   onchainState: ERROR [object Object] (+27719ms)
 */
describe('errorSummary', () => {
	it('reads the message off a plain object, where String() gave up', () => {
		expect(errorSummary({message: 'execution reverted: nope'})).toBe(
			'execution reverted: nope',
		);
	});

	it('keeps an Error as itself', () => {
		expect(errorSummary(new Error('boom'))).toBe('boom');
	});

	it('says something honest about an object with no message at all', () => {
		// Better than `[object Object]` twice over: the type is named, and it
		// is visibly a fallback rather than an answer.
		expect(errorSummary({cause: 'whatever'})).toBe('[object Object]');
		expect(errorSummary(undefined)).toBe('undefined');
		expect(errorSummary('plain string')).toBe('plain string');
	});

	it('does not mistake an empty message for an answer', () => {
		// `''` is "no message given", not a summary.
		expect(errorSummary({message: ''})).toBe('[object Object]');
	});
});
