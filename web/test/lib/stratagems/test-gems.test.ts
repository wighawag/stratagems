import {describe, expect, it, vi} from 'vitest';
import {get} from 'svelte/store';
import type {TypedDeployments} from '$lib/core/connection/types';
import {createTestGems, testGemsDistributor} from '$lib/stratagems/test-gems';

const DISTRIBUTOR = {
	address: '0x000000000000000000000000000000000000d157' as const,
	abi: [],
};
const withDistributor = {
	contracts: {TestTokensDistributor: DISTRIBUTOR},
} as unknown as TypedDeployments;
const without = {contracts: {}} as unknown as TypedDeployments;

describe('test gems', () => {
	it('are offered only where the deployment has a distributor', () => {
		expect(testGemsDistributor(withDistributor)).toBe(DISTRIBUTOR);
		expect(testGemsDistributor(without)).toBeUndefined();
		expect(get(createTestGems({deployments: without, send: vi.fn()}))).toEqual({
			step: 'Unavailable',
		});
	});

	it('call `topup` from the wallet, then refresh', async () => {
		const send = vi.fn(async () => {});
		const onReceived = vi.fn();
		const gems = createTestGems({
			deployments: withDistributor,
			send,
			onReceived,
		});
		expect(get(gems)).toEqual({available: true, step: 'Idle'});
		await gems.get();
		expect(send).toHaveBeenCalledWith(
			{address: DISTRIBUTOR.address, abi: [], functionName: 'topup'},
			'Getting test gems',
		);
		expect(onReceived).toHaveBeenCalledOnce();
	});

	it('keep a failure to show', async () => {
		const gems = createTestGems({
			deployments: withDistributor,
			send: vi.fn(async () => {
				throw Object.assign(new Error('long'), {
					shortMessage: 'User rejected the request.',
				});
			}),
		});
		await gems.get();
		expect(get(gems)).toEqual({
			available: true,
			step: 'Error',
			message: 'User rejected the request.',
		});
	});
});
