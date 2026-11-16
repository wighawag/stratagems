import {describe, it, expect} from 'vitest';
import {walletShortOfStake} from '$lib/stratagems/stake';

const GEM = 10n ** 18n;

describe('whether the wallet can pay a stake', () => {
	it('is short, saying what it holds, below one stake', () => {
		expect(
			walletShortOfStake({step: 'Loaded', tokenBalance: 0n}, 32n * GEM),
		).toBe(0n);
		expect(
			walletShortOfStake({step: 'Loaded', tokenBalance: 31n * GEM}, 32n * GEM),
		).toBe(31n * GEM);
	});

	it('is not short from one stake up', () => {
		expect(
			walletShortOfStake({step: 'Loaded', tokenBalance: 32n * GEM}, 32n * GEM),
		).toBeUndefined();
	});

	it('holds nothing back while the balance is unread', () => {
		expect(walletShortOfStake({step: 'Unloaded'}, 32n * GEM)).toBeUndefined();
	});
});
