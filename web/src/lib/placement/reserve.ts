/**
 * The reserve: the tokens a player puts at risk in order to play.
 *
 * This is the template's answer to the second commit-reveal rule - something
 * must be at stake, or nobody has to reveal. A player who dislikes what they
 * committed to can always go quiet; the bond taken from this reserve at commit
 * time, and forfeited when a missed reveal is settled, is what makes that cost
 * them. A game that gates differently (holding custody of an item the player
 * bought, say) replaces this file; the framework only requires that SOMETHING
 * is lost.
 *
 * This READS the stake and takes it back out. Putting one there is the
 * acquisition rail's job (`$lib/game/acquire`, wired through
 * `./acquisition.ts`), because acquiring a stake is the same shape in every
 * game and getting it wrong costs the player money. It used to be `fund()`
 * here: mint, approve, add to the reserve, three transactions the wallet asked
 * about one at a time with nothing on screen explaining why there were three,
 * and no memory of any of them across a reload.
 */
import {get, writable, type Readable} from 'svelte/store';
import type {Context} from '$lib/context/types';
import {onchainIdentity, type ActiveIdentityStore} from '$lib/game/identity';
import type {PlacementConfig} from './config';

export type ReserveState =
	{step: 'Unloaded'} | {step: 'Loaded'; amount: bigint; tokenBalance: bigint};

export type ReserveStore = Readable<ReserveState> & {
	update(): Promise<void>;
	withdraw(amount: bigint): Promise<void>;
};

/**
 * What the reserve needs.
 *
 * `accountExecutor`, NOT `signerExecutor`: taking money back out is the
 * player's own, so it is sent from the wallet they control, with a prompt,
 * deliberately. The reserve is filed under the IDENTITY, and withdrawing from
 * it is the ACCOUNT's own act - the same address here, and not the same
 * sentence in a game whose identity is a token. The signer neither pays nor
 * owns; it acts for the account, and only once `registerDelegate` has
 * authorised it onchain.
 * `withdrawFromReserve` is the one account-facing call a delegate may NOT make,
 * which is what makes a disposable browser key safe to hold.
 */
export type ReserveDeps = Pick<
	Context,
	| 'connection'
	| 'accountExecutor'
	| 'deployments'
	| 'balanceCheck'
	| 'publicClient'
	| 'account'
	// The payer's gas, so the balance check measures the account that actually
	// pays. See EnsureCanAffordOptions.
	| 'accountBalance'
>;

export function createReserve(params: {
	deps: ReserveDeps;
	config: PlacementConfig;
	/**
	 * WHO PLAYS, and so whose reserve this is. Passed in rather than read off
	 * the context: what a game plays AS is the game's own decision, not
	 * something the core knows about.
	 *
	 * The identity and not the account, deliberately. They hold the same value
	 * in this game; the stake belongs to whoever is at risk of forfeiting it,
	 * which is the thing that commits.
	 */
	identity: ActiveIdentityStore;
}): ReserveStore {
	const {deps} = params;
	const state = writable<ReserveState>({step: 'Unloaded'});

	async function update() {
		// The reserve is filed under WHO PLAYS; the tokens sit with the address
		// that PAYS. Both are the account here, since that is what this game plays
		// as and what it stakes from. They keep separate names because
		// `addToReserve` lets a payer credit someone else, and a game that takes
		// that up should not have to untangle one name doing two jobs.
		const player = get(params.identity);
		const payer = get(deps.account);
		// `=== undefined` for the identity, not falsy: it can be a token id of `0n`.
		// The payer is an account and so is genuinely an address or nothing.
		if (player === undefined || !payer) {
			state.set({step: 'Unloaded'});
			return;
		}
		const $deployments = get(deps.deployments);

		const [amount, tokenBalance] = await Promise.all([
			deps.publicClient.readContract({
				address: $deployments.contracts.Game.address,
				abi: $deployments.contracts.Game.abi,
				functionName: 'getReserve',
				args: [onchainIdentity(player)],
			}) as Promise<bigint>,
			deps.publicClient.readContract({
				address: $deployments.contracts.GameToken.address,
				abi: $deployments.contracts.GameToken.abi,
				functionName: 'balanceOf',
				args: [payer],
			}) as Promise<bigint>,
		]);

		state.set({step: 'Loaded', amount, tokenBalance});
	}

	/**
	 * Send and wait for inclusion.
	 *
	 * Not merely cosmetic: `writeContract` resolves on BROADCAST, so the read
	 * that follows would race the transaction it is meant to reflect, and the
	 * HUD would report the reserve the player just changed as unchanged. A local
	 * node with automine hides this; anything else does not.
	 */
	async function sendAndWait(
		executor: {
			client: {writeContract: (request: never) => Promise<`0x${string}`>};
		},
		request: unknown,
		what: string,
	) {
		const hash = await executor.client.writeContract(request as never);
		const receipt = await deps.publicClient.waitForTransactionReceipt({hash});
		if (receipt.status === 'reverted') {
			throw new Error(`${what} failed`);
		}
	}

	async function ready() {
		await deps.connection.ensureConnected();
		const $executor = get(deps.accountExecutor);
		if ($executor.status === 'cannot-send') {
			throw new Error('This account cannot send transactions in this mode.');
		}
		if ($executor.status !== 'ready') {
			throw new Error('No account connected.');
		}
		return {executor: $executor, deployments: get(deps.deployments)};
	}

	async function withdraw(amount: bigint) {
		const {executor, deployments} = await ready();
		const payer = executor.address;
		await sendAndWait(
			executor,
			await deps.balanceCheck.ensureCanAfford(
				{
					contract: {
						address: deployments.contracts.Game.address,
						abi: deployments.contracts.Game.abi,
						functionName: 'withdrawFromReserve',
						args: [amount],
						account: executor.account,
					},
				},
				{balance: deps.accountBalance, sender: payer},
			),
			'Withdrawing from your reserve',
		);
		await update();
	}

	return {subscribe: state.subscribe, update, withdraw};
}
