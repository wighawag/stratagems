/**
 * A call the PLAYER'S WALLET sends (`accountExecutor`, which prompts), for the
 * player's own asset moves: collecting winnings (`pokeMultiple`, P7 of step 6c)
 * and getting test gems. Never the browser's key, whose gas is sized for
 * commits and reveals (step S's stipend).
 *
 * The shape of the base's reserve withdrawal (`$lib/game/core/commit-reveal/
 * reserve.ts`): connect, check the account can afford it, send, and wait for
 * inclusion, because `writeContract` resolves on broadcast and a read made then
 * would not see the change yet.
 */
import {get} from 'svelte/store';
import type {Abi} from 'viem';
import type {CoreServices} from '$lib/context/core';

export type WalletDeps = Pick<
	CoreServices,
	| 'connection'
	| 'accountExecutor'
	| 'balanceCheck'
	| 'publicClient'
	| 'accountBalance'
>;

export type WalletCall = {
	address: `0x${string}`;
	abi: Abi;
	functionName: string;
	args?: readonly unknown[];
};

export type WalletSend = (call: WalletCall, what: string) => Promise<void>;

export function createWalletSend(deps: WalletDeps): WalletSend {
	return async (call, what) => {
		await deps.connection.ensureConnected();
		const executor = get(deps.accountExecutor);
		if (executor.status === 'cannot-send') {
			throw new Error('This account cannot send transactions in this mode.');
		}
		if (executor.status !== 'ready') {
			throw new Error('No account connected.');
		}
		const request = await deps.balanceCheck.ensureCanAfford(
			{
				contract: {
					address: call.address,
					abi: call.abi,
					functionName: call.functionName,
					args: call.args ?? [],
					account: executor.account,
				} as never,
			},
			{balance: deps.accountBalance, sender: executor.address},
		);
		const hash = await executor.client.writeContract(request as never);
		const receipt = await deps.publicClient.waitForTransactionReceipt({hash});
		if (receipt.status === 'reverted') throw new Error(`${what} failed`);
	};
}

/** A wallet action's state, for a button that says what it is doing. */
export type WalletActionState =
	{step: 'Idle'} | {step: 'Sending'} | {step: 'Error'; message: string};

export function errorMessage(error: unknown): string {
	if (error && typeof error === 'object') {
		const short = (error as {shortMessage?: unknown}).shortMessage;
		if (typeof short === 'string') return short;
	}
	return error instanceof Error ? error.message : String(error);
}
