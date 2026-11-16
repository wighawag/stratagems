import {describe, expect, it} from 'vitest';
import {get, writable} from 'svelte/store';
import {createHud} from '$lib/stratagems/hud/hud';
import type {Context} from '$lib/context/types';

/**
 * The stake buttons say when the wallet holds less than a stake: the stake
 * moves gems from it, so pressing short of them only buys a revert
 * (`NotEnoughTokens`, met on a local chain before the test gems were taken).
 * Said, not enforced: gems may come from another wallet, which the rail asks
 * about only once the button is pressed.
 */
const GEM = 10n ** 18n;
const STAKE = 32n * GEM;

function hudWith(params: {
	tokenBalance: bigint;
	amount?: bigint;
	acquisition?: {step: string};
	tableStake?: ReturnType<typeof writable<bigint | undefined>>;
}) {
	const context = {
		hasLocalSigner: true,
		deployments: {
			get: () => ({chain: {nativeCurrency: {symbol: 'ETH', decimals: 18}}}),
		},
		game: {
			config: {
				currency: {symbol: 'GEMS', decimals: 18},
				stakeAmount: STAKE,
				stipend: 0n,
			},
			twoPhase: writable({phase: 'commit', timeLeft: 5, duration: 10}),
			phase: writable('play'),
			submission: writable({step: 'Idle'}),
			planning: {count: writable(0), maxActions: writable(undefined)},
			cost: writable(0n),
			reserve: writable({
				step: 'Loaded',
				amount: params.amount ?? 0n,
				tokenBalance: params.tokenBalance,
			}),
			cycleInfo: writable({currentCycleNumber: 3}),
			missedReveal: writable({step: 'Clear'}),
			setup: writable(
				(params.amount ?? 0n) === 0n ? {step: 'stake'} : undefined,
			),
			acquisition: writable(params.acquisition ?? {step: 'Idle'}),
			recovery: writable({step: 'Idle'}),
			revealSchedule: writable(undefined),
			...(params.tableStake ? {tableEnd: {stake: params.tableStake}} : {}),
		},
	} as unknown as Context;
	return createHud(context);
}

describe('the stake, short of gems in the wallet', () => {
	it('says what the wallet holds and what a stake takes, and leaves the button to be pressed', () => {
		const hud = get(hudWith({tokenBalance: 0n}));
		expect(hud.setup?.action).toBe('stake');
		expect(hud.setup?.busy).toBe(false);
		expect(hud.setup?.walletShort).toBe(
			'Your wallet holds 0 gems and a stake takes 32 gems.',
		);
	});

	it('says nothing from one stake up', () => {
		expect(
			get(hudWith({tokenBalance: STAKE})).setup?.walletShort,
		).toBeUndefined();
	});

	it('says nothing while one is in flight, whose gems have just left', () => {
		const hud = get(
			hudWith({tokenBalance: 0n, acquisition: {step: 'Acquiring'}}),
		);
		expect(hud.setup?.busy).toBe(true);
		expect(hud.setup?.walletShort).toBeUndefined();
		expect(hud.walletShort).toBeUndefined();
	});

	it('says it beside "Add stake" on a board already played', () => {
		expect(get(hudWith({tokenBalance: 0n, amount: STAKE})).walletShort).toBe(
			'Your wallet holds 0 gems and a stake takes 32 gems.',
		);
		expect(
			get(hudWith({tokenBalance: STAKE, amount: STAKE})).walletShort,
		).toBeUndefined();
	});

	it("follows a table's stake once it is read", () => {
		const tableStake = writable<bigint | undefined>(undefined);
		const hud = hudWith({tokenBalance: STAKE, tableStake});
		const seen: (string | undefined)[] = [];
		const stop = hud.subscribe(($hud) => seen.push($hud.setup?.walletShort));
		// the world's stake until the table's options are read
		expect(seen.at(-1)).toBeUndefined();
		tableStake.set(50n * GEM);
		expect(seen.at(-1)).toBe(
			'Your wallet holds 32 gems and a stake takes 50 gems.',
		);
		expect(get(hud).setup?.actionLabel).toBe('Stake 50 gems');
		stop();
	});
});
