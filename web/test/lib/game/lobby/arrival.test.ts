import {describe, it, expect} from 'vitest';
import {
	CONTINUE_PARAM,
	isContinueRequested,
	openingOf,
	withContinue,
} from '$lib/game/lobby/arrival';

/**
 * ARRIVING OR RELOADING: what a lobby does when it opens, and how the URL says
 * which one it is. See `$lib/game/lobby/arrival`.
 */
describe('what a lobby does when it opens', () => {
	it('shows the setup when there is no saved game, asked to continue or not', () => {
		for (const continueRequested of [false, true]) {
			expect(
				openingOf({saved: false, restorable: false, continueRequested}),
			).toBe('setup');
		}
	});

	it('offers the choice to an arrival at a saved game', () => {
		expect(
			openingOf({saved: true, restorable: true, continueRequested: false}),
		).toBe('choose');
	});

	it('continues a saved game when asked to, without asking', () => {
		expect(
			openingOf({saved: true, restorable: true, continueRequested: true}),
		).toBe('continue');
	});

	it('shows the setup for a saved game that cannot be restored, asked to continue or not', () => {
		// Continuing it could only fail, and the choice would offer it anyway.
		for (const continueRequested of [false, true]) {
			expect(
				openingOf({saved: true, restorable: false, continueRequested}),
			).toBe('setup');
		}
	});
});

describe('the continue param', () => {
	it('is read wherever it is in the query, with or without a value', () => {
		expect(CONTINUE_PARAM).toBe('continue');
		expect(isContinueRequested('?continue')).toBe(true);
		expect(isContinueRequested('?continue=')).toBe(true);
		expect(isContinueRequested('?a=1&continue')).toBe(true);
		expect(isContinueRequested('')).toBe(false);
		expect(isContinueRequested('?continued')).toBe(false);
	});

	it('is added as a bare param, keeping the path, the other params and the hash', () => {
		expect(withContinue('http://localhost:4173/offline/')).toBe(
			'http://localhost:4173/offline/?continue',
		);
		expect(withContinue('http://localhost/base/offline/?a=1#x')).toBe(
			'http://localhost/base/offline/?a=1&continue#x',
		);
	});

	it('is not added twice: a URL that has it needs no rewrite', () => {
		expect(withContinue('http://localhost/offline/?continue')).toBeUndefined();
		expect(
			withContinue('http://localhost/offline/?a=1&continue='),
		).toBeUndefined();
	});
});
