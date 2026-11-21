import {describe, it, expect, vi, beforeEach} from 'vitest';

/**
 * THE ONE PERSON AT THIS DEVICE, SEATED (K2b): the world connects its own
 * wallet, signs in when the app does, and authorises this browser's key
 * itself, none of it fatal to a booted world. The hotseat half (each person
 * signed in and authorised in turn) switches a real connection's account and
 * is pinned in a browser by `offline-hotseat.e2e.ts`.
 */

const authorised: unknown[] = [];
let outcome: Promise<{step: string}> = Promise.resolve({step: 'Authorised'});
vi.mock('$lib/ui/delegation/authorise-here', () => ({
	authoriseTheBrowsersKey: (context: unknown) => {
		authorised.push(context);
		return outcome;
	},
}));

const {seatTheHumans} = await import('$lib/game/offline');

function connection(params: {
	target: 'SignedIn' | 'WalletConnected';
	fails?: boolean;
}) {
	const calls: string[] = [];
	return {
		calls,
		connection: {
			targetStep: params.target,
			ensureConnected: async (step: string) => {
				calls.push(`ensureConnected ${step}`);
				if (params.fails) throw new Error('no wallet');
			},
			requestSignature: async () => {
				calls.push('requestSignature');
			},
		},
	};
}

beforeEach(() => {
	authorised.length = 0;
	outcome = Promise.resolve({step: 'Authorised'});
});

describe('seatTheHumans, one person here', () => {
	it('connects, signs in, then authorises this browser’s key, and seats nobody for a handover', async () => {
		const {calls, connection: c} = connection({target: 'SignedIn'});
		const context = {connection: c};
		const steps: string[] = [];
		const seated = await seatTheHumans({
			context: context as never,
			wallet: undefined,
			humans: [{seat: 0, account: 0}],
			identityOf: async () => 1n,
			onStep: (what) => steps.push(what),
		});
		expect(calls).toEqual([
			'ensureConnected WalletConnected',
			'requestSignature',
		]);
		expect(authorised).toEqual([context]);
		expect(seated).toEqual([]);
		expect(steps).toEqual(['connecting', "authorising this browser's key"]);
	});

	it('still authorises after a connect that failed, and survives a refusal', async () => {
		const {connection: c} = connection({target: 'SignedIn', fails: true});
		outcome = Promise.reject(new Error('refused'));
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		await expect(
			seatTheHumans({
				context: {connection: c} as never,
				wallet: undefined,
				humans: [{seat: 0, account: 0}],
				identityOf: async () => 1n,
			}),
		).resolves.toEqual([]);
		expect(authorised).toHaveLength(1);
		expect(errors).toHaveBeenCalledTimes(2);
		errors.mockRestore();
	});
});
