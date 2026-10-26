/**
 * TEST GEMS (P2 of step 6c in work/plans/join-template-commit-reveal.md): how a
 * player gets gems to stake on a deployment that hands them out for free.
 *
 * Every local deploy (`contracts/deploy/002_deploy_test_tokens_distributor.ts`,
 * `name == 'localhost'`, the e2e's included) has `TestTokensDistributor`, whose
 * `topup()` mints 15 gems to the caller, anyone, any number of times: the legacy
 * InfoBar's "Get Test token". Offered only where the deployment has that
 * contract, and sent from the wallet, since the gems are the wallet's. How a
 * live chain hands out gems (claim links, a faucet, a sale) is step D's.
 */
import {derived, get, writable, type Readable} from 'svelte/store';
import type {Abi} from 'viem';
import type {TypedDeployments} from '$lib/core/connection/types';
import {errorMessage, type WalletActionState, type WalletSend} from './wallet';

/** What `topup()` mints, in gems. */
export const TOPUP_GEMS = 15;

type Distributor = {address: `0x${string}`; abi: Abi};

/** The deployment's distributor, when it has one. */
export function testGemsDistributor(deployments: TypedDeployments): Distributor | undefined {
	const contracts = deployments.contracts as unknown as Record<string, Distributor | undefined>;
	return contracts.TestTokensDistributor;
}

export type TestGemsState = {step: 'Unavailable'} | ({available: true} & WalletActionState);

export type TestGemsStore = Readable<TestGemsState> & {
	get(): Promise<void>;
};

export function createTestGems(params: {
	deployments: TypedDeployments;
	send: WalletSend;
	/** Called once the gems landed (to refresh the wallet's gem balance). */
	onReceived?: () => void;
}): TestGemsStore {
	const distributor = testGemsDistributor(params.deployments);
	const action = writable<WalletActionState>({step: 'Idle'});
	const state = derived(action, ($action): TestGemsState =>
		distributor ? {available: true, ...$action} : {step: 'Unavailable'},
	);

	async function getGems() {
		if (!distributor || get(action).step === 'Sending') return;
		action.set({step: 'Sending'});
		try {
			await params.send(
				{
					address: distributor.address,
					abi: distributor.abi,
					functionName: 'topup',
				},
				'Getting test gems',
			);
			action.set({step: 'Idle'});
			params.onReceived?.();
		} catch (error) {
			action.set({step: 'Error', message: errorMessage(error)});
		}
	}

	return {subscribe: state.subscribe, get: getGems};
}
