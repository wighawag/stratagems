import {get} from 'svelte/store';
import {isRegistered} from '$lib/onchain/delegation';
import {registrationRequest} from '$lib/ui/delegation/registration';
import {
	delegationAccountOf,
	submitRegistration,
} from '$lib/ui/delegation/register-delegate';
import {topUpCeiling} from '$lib/ui/credits';
import type {Context} from '$lib/context/types';

/**
 * AUTHORISE THE KEY THIS BROWSER PLAYS WITH, INSTEAD OF ASKING.
 *
 * THE REST OF THIS RAIL PUTS A DIALOG IN FRONT OF THE SAME TWO CALLS, and it is
 * right to: `acquire.ts` asks who is paying and what it costs, because the
 * player is about to spend their own money. This is the same step for a caller
 * where that question has exactly one possible answer, and a question with one
 * possible answer is not consent, it is a gate.
 *
 * THE CALLER THAT HAS ONE TODAY IS AN OFFLINE WORLD, and it is worth spelling
 * out what is and is not removed there, because it is not what it looks like.
 * The stake and the gas are already given: the world buys every seat at the
 * table its stake through the real sale and sets its balance by cheat call, so
 * the setup gate's `stake` step never fires and there is no purchase anywhere to
 * delete. What was left was the `authorise` step - registering this browser's
 * signer as a delegate of the account, and funding it - and there the payer and
 * the payee are the same wallet, on a chain in the tab, holding money the world
 * invented.
 *
 * WHY IT CAN HAPPEN AT ALL, given that a world's own provisioning says in
 * capitals that it cannot. Because it is not provisioning. The signer is derived
 * in the tab from the wallet SIGNATURE sign-in asks for, which happens after the
 * game, after the context, and after provisioning has returned - so this runs in
 * the step that already has the signature, and that is the first moment there is
 * an address to register.
 *
 * WHY THIS IS IN THE FRAMEWORK EVEN THOUGH IT IMPORTS `$lib/ui/*`, which looks
 * like a layering violation and is not. `acquire.ts` beside it imports exactly
 * the same set (`ui/delegation/registration`, `ui/delegation/register-delegate`,
 * `onchain/delegation`, `context/types`) for exactly the same delegation dance,
 * so this is established precedent rather than a new hole: the delegation flow's
 * entry points live in `ui/` and the rail is what drives them. What would be a
 * violation is a module in here naming a game, a contract or a stake, and this
 * one names none.
 *
 * THE SAME TWO FUNCTIONS THE BUTTON WOULD HAVE USED, deliberately.
 * `registrationRequest` decides the entry point and `submitRegistration` sends
 * it and judges the receipt, exactly as the top-up flow does behind "Authorise
 * and carry on". What is skipped is the modal in front of them - choosing a
 * payer, and confirming - and nothing about the contract path changes. That
 * matters for more than tidiness: this is the only place the offline world
 * touches delegation, so a shortcut here would leave the world exercising
 * something the online game does not do.
 *
 * THE DIRECT ROUTE, with no signature, and it falls out rather than being
 * chosen: the account IS the payer here, so sending the transaction is the
 * proof and `registerDelegate` needs nothing signed. `chooseRegistrationRoute`
 * would answer the same (`direct` comes first precisely to collapse this
 * case); it is not consulted only because there is nothing here to choose
 * between.
 *
 * AND THE CALLER SAYS IT HAPPENED. This function does the work; telling the
 * player is the caller's, and the offline world keeps that sentence in
 * `$lib/offline-lobby` where its route renders it. The split is deliberate, and
 * the sentence is not decoration: an offline world is the last place a player
 * meets what playing online costs, so a step taken FOR them has to be one they
 * were told about, or they meet it for the first time on a real chain with no
 * idea what it is.
 */
export type AuthorisationOutcome =
	/** The chain already said this browser may play. Nothing was sent. */
	| {step: 'AlreadyAuthorised'}
	/** One transaction: the key is registered and holds gas of its own. */
	| {step: 'Authorised'}
	/**
	 * Nothing could be done, with the reason.
	 *
	 * NOT THROWN, because there is a remedy and the player already has it: the
	 * game's own setup gate comes back with the button on it, which is what a
	 * player would have pressed anyway. A booted world is not worth discarding
	 * over a step that can still be taken by hand.
	 */
	| {step: 'Refused'; reason: string};

/**
 * What this needs of a context, which is five members and no more.
 *
 * Named as a subset rather than taking the whole `Context`, so the dependency
 * is legible and a test can supply five fakes. They are exactly the five the
 * top-up flow uses for this same step.
 */
export type AuthorisationDeps = Pick<
	Context,
	'connection' | 'delegation' | 'accountExecutor' | 'publicClient' | 'credits'
>;

export async function authoriseTheBrowsersKey(
	deps: AuthorisationDeps,
): Promise<AuthorisationOutcome> {
	const {connection, delegation, accountExecutor, publicClient, credits} = deps;

	// The (chain, contract) pair, spelled the way a CREDENTIAL is bound - which
	// is not quite the shape the registry is stored in, and deliberately so: a
	// registry is a contract to write to, a target is what an authorisation is
	// good at. Built from the registry the STATE was read from, so the read, the
	// route and the write cannot disagree.
	const target = {
		chainId: delegation.registry.chainId,
		contract: delegation.registry.address,
	};
	const account = delegationAccountOf(get(connection), target);
	if (!account) {
		// Before sign-in there is no signer, so there is nothing to authorise and
		// nothing this could be about. The world connects and signs in before
		// calling this, so reaching here means that failed - in which case saying
		// so beats sending a transaction naming an address nobody holds.
		return {step: 'Refused', reason: 'nobody is signed in to this world'};
	}

	// ASKED FRESH rather than read off whatever the poll last saw. This runs
	// during a boot, so the first read may not have landed, and `isRegistered`
	// treats an unfinished read as NOT registered - the safe direction for a
	// gate, and the wrong one here, where it would spend a transaction
	// re-registering a key that a restored world authorised on its first boot.
	await delegation.update();
	if (isRegistered(get(delegation))) return {step: 'AlreadyAuthorised'};

	const $executor = get(accountExecutor);
	if ($executor.status !== 'ready') {
		return {
			step: 'Refused',
			reason: `this world's account cannot send (${$executor.status})`,
		};
	}

	const result = await submitRegistration({
		// The contract the delegation state was READ from, rather than a second
		// lookup: a registration is bound to one (chain, contract) pair, and
		// registering anywhere else would leave the board still refusing every
		// move. See onchain/delegation.
		registry: {
			address: delegation.registry.address,
			abi: delegation.registry.abi,
		},
		client: $executor.client,
		publicClient,
		account: $executor.account,
		request: registrationRequest({
			owner: account.owner,
			delegate: account.delegate,
			// WHAT ONE TOP-UP IS WORTH, from the helper the flow prices with rather
			// than a number invented here. The world's account holds play money so
			// nothing binds except the ceiling, and the ceiling is the honest
			// amount: a signer only ever spends gas, and parking more in it is
			// money that cannot easily come back. Denominated in this chain's own
			// credits configuration, which the world copies from the deploy rather
			// than restating.
			value: topUpCeiling(credits),
			// No credential: the owner is sending, and sending is the proof.
		}),
	});

	if (result.status !== 'registered') {
		return {
			step: 'Refused',
			reason:
				result.status === 'cancelled'
					? 'the wallet refused'
					: result.status === 'stale-credential'
						? 'the contract refused the credential'
						: result.message,
		};
	}

	// The board gates on this read, so refresh it before returning: a gate still
	// looking at a stale "not registered" would put the button back in front of
	// a key that is now authorised.
	await delegation.update();
	return {step: 'Authorised'};
}
