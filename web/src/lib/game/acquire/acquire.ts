/**
 * Acquiring what lets you play: one transaction, a gas stipend, recoverable.
 *
 * Every game on this template gates entry on something. It has to: a player
 * who dislikes what they committed to can simply go quiet, so unless holding a
 * position costs something, nobody has to reveal. WHAT that something is varies
 * (a bonded token reserve, custody of an item the player bought, a pass), and
 * this file does not care. What every one of them shares is the shape of
 * getting it, and that shape is the whole of this module:
 *
 *   1. the owner SIGNS a delegation. Free, no transaction, and for an account
 *      whose credential was minted at sign-in not even a prompt.
 *   2. the owner sends ONE transaction, which acquires the thing and forwards a
 *      stipend to this browser's local signer in the same call.
 *   3. the SIGNER registers itself, paying out of the stipend it just received.
 *
 * ONE TRANSACTION IS THE POINT, and it is not a nicety. The alternative asks
 * for two transactions from the owner, and on a fresh wallet two faucet claims:
 * the first sends almost everything the faucet gave to the signer, and the
 * second then finds an empty wallet. Folding the authorisation into a signature
 * is what removes the second one, and it is strictly better for an account that
 * has no wallet to prompt at all.
 *
 * Step 3 failing is survivable and deliberately not rolled back: the player has
 * what they paid for and this browser is not yet authorised, which is exactly
 * the state a separate `authorise` step exists for.
 *
 * Unlike a move, this SPENDS THE PLAYER'S OWN MONEY, so it goes through
 * `accountExecutor` and prompts the wallet, and through `balanceCheck` so a
 * player who cannot cover it is told before signing rather than after. Moves go
 * the other way (silent, signer-paid) and the game's commit-reveal adapter
 * explains why.
 *
 * WHAT A GAME SUPPLIES is {@link Acquisition}: where the call goes, what it
 * costs, and how to build it. Nothing else here is game-specific, which is why
 * it lives beside the submission rather than in any one game's directory.
 */
import {derived, get, readable, writable, type Readable} from 'svelte/store';
import {logs} from 'named-logs';
import type {Abi} from 'viem';
import type {Context} from '$lib/context/types';
import {isRegistered} from '$lib/onchain/delegation';
import {
	InsufficientFundsError,
	isUserRejectionError,
	txErrorSummary,
} from '$lib/core/transaction';
import {createBalanceStore} from '$lib/core/connection/balance';
import {
	availablePaymentMethods,
	paymentMethods,
	spendableBalance,
	NO_PAYMENT_METHOD_EXPLANATION,
	type PaymentMethod,
	type PaymentMethodId,
} from '$lib/core/funding';
import {effectiveGasPrice} from '$lib/core/connection/gasFee';
import {registrationRequest} from '$lib/ui/delegation/registration';
import {
	delegationAccountOf,
	fetchDelegation,
	signsWithoutPrompt,
	submitRegistration,
} from '$lib/ui/delegation/register-delegate';
import {consentBullets, type SignerGrant} from '$lib/ui/delegation/grant';
import {findPendingAcquisition, type PendingAcquisition} from './pending';

/**
 * Onboarding is three steps across two senders, and only the middle one
 * prompts. Traced so a recording can tell "waiting for the wallet" from "the
 * signer is working" from "nothing is happening". Inert unless the namespace is
 * enabled.
 */
const logger = logs('game:acquire');

/** The call that acquires the thing, minus what the rail already knows. */
export type AcquisitionCall = {
	abi: Abi;
	args: readonly unknown[];
	/**
	 * Native currency to send: the price plus whatever stipend is being
	 * forwarded, since the same transaction carries both.
	 */
	value: bigint;
};

/**
 * What a game acquires, and how.
 *
 * The one seam here. It deliberately does NOT include the address or the
 * function name in {@link AcquisitionCall}: those are stated once, below, and
 * the rail uses the same pair to build the call AND to recognise it later in
 * the operations ledger. Letting the request name its own function would let
 * the two drift, and the symptom of that is silent - the purchase works, and
 * the recovery after a reload stops finding it.
 */
export type Acquisition = {
	/** Where the acquiring call goes. */
	address: `0x${string}`;
	/** The function it calls. */
	functionName: string;
	/**
	 * What the thing costs, in the chain's own currency. May be zero.
	 *
	 * Read off the deployment that CHARGES it rather than copied anywhere else:
	 * a contract that checks the value exactly turns a stale copy of this number
	 * into a revert on every attempt.
	 */
	price: bigint;
	/**
	 * What the same transaction forwards to this browser's signer, or zero.
	 *
	 * This is what makes onboarding one transaction rather than two. Size it in
	 * TURNS rather than as a round number: what the player needs is a number of
	 * moves, at the chain's own idea of a bad gas price.
	 */
	stipend: bigint;
	/**
	 * Gas to keep back when asking whether a payer can afford it.
	 *
	 * Generously rounded: being short here offers a payer who then fails in the
	 * wallet, while being generous only sends someone to the other payment
	 * method a little early.
	 */
	gas: bigint;
	/**
	 * Build the call.
	 *
	 * `stipendTo` is undefined when there is no signer to fund, and `stipend` is
	 * then zero: a request must not tell the contract to forward what it was not
	 * given, or the value and the split disagree and the call reverts.
	 */
	request(params: {
		owner: `0x${string}`;
		stipendTo: `0x${string}` | undefined;
		stipend: bigint;
	}): AcquisitionCall;
};

/** Price plus stipend: what the wallet is actually asked for. */
export function acquisitionTotal(params: {
	price: bigint;
	stipend: bigint;
}): bigint {
	return params.price + params.stipend;
}

/**
 * What this call forwards, and to whom. The two move TOGETHER, always.
 *
 * ONLY FUND A SIGNER THAT IS GOING TO BE REGISTERED. Sending a stipend to a key
 * that cannot act for the account parks the player's money somewhere they
 * cannot easily get it back from, and there are two ordinary ways to reach that
 * state: a build with no sign-in derives no signer at all, and a browser that is
 * already a delegate has nothing to authorise and so takes no stipend.
 *
 * Its own function because the pairing is the whole rule and it is invisible
 * when it breaks in the cheap direction: a stipend with no recipient is either
 * kept by the contract or, if the contract refuses it, reverts every purchase
 * the moment a returning player buys a second time. Neither shows up in a type.
 */
export function stipendFor(params: {
	/** The delegate about to be registered, or undefined if there is none. */
	delegate: `0x${string}` | undefined;
	/** What the game would forward, if there were somebody to forward it to. */
	stipend: bigint;
}): {stipendTo: `0x${string}` | undefined; stipend: bigint} {
	return params.delegate
		? {stipendTo: params.delegate, stipend: params.stipend}
		: {stipendTo: undefined, stipend: 0n};
}

/**
 * How the owner's authorisation will be obtained for THIS acquisition.
 *
 * The template's vocabulary, from `ui/delegation/registration.ts`, minus the
 * routes that cannot happen here: the owner never sends the registration
 * itself, because the SIGNER sends it out of the stipend this call forwards, so
 * `direct` is not among these however the thing is paid for.
 *
 * `silent-signature` is the development burner, which signs live from a key in
 * this browser and opens nothing. It is the template's `silentSigner` flag by
 * another name, folded in here because from the player's side it is the same
 * question as the other two: is a window about to open?
 */
export type AcquisitionAuthorisation =
	/** Minted at sign-in and already held. Nothing opens. */
	| 'pre-signed'
	/** The owner's wallet will be asked to sign, now. */
	| 'live-signature'
	/** Signed live, by a wallet that never prompts. */
	| 'silent-signature';

/** Whether this route puts a signature request in front of the player. */
export function opensAWallet(authorisation: AcquisitionAuthorisation): boolean {
	return authorisation === 'live-signature';
}

/**
 * How this acquisition will authorise the browser, or undefined if it will not.
 *
 * Pure, and stated in terms of what the SHARED readers already answer, because
 * every input here is one of theirs: `isRegistered` for the chain read,
 * `delegationAccountOf(...).canSignLive` for whether the owner can be asked to
 * sign right now (it folds together a wallet on the connection and a host that
 * reports `sign-on-demand`), and `signsWithoutPrompt` for the one wallet that
 * signs without showing anything. Nothing is re-derived from account types
 * here; `registration.ts` explains at length why branching on those is wrong.
 *
 * Exported because it is the whole of a rule that is easy to get wrong, and
 * because the case that is easiest to get wrong - an account whose credential
 * was minted at sign-in - cannot be reached from a test any other way.
 */
export function acquisitionAuthorisation(params: {
	/** Whether this browser's signer is already a delegate of the account. */
	registered: boolean;
	/** Whether there is a local signer to authorise at all. */
	hasSigner: boolean;
	/** `DelegationAccount.canSignLive`: the owner can be asked to sign now. */
	ownerCanSignLive: boolean;
	/** `signsWithoutPrompt`: that wallet signs without showing anything. */
	silentWallet: boolean;
}): AcquisitionAuthorisation | undefined {
	// Nothing to authorise: the signer may already act, or there is no signer to
	// act with (a build with no sign-in, where the player plays through their
	// wallet). Either way the acquisition is only an acquisition.
	if (params.registered || !params.hasSigner) return undefined;
	if (!params.ownerCanSignLive) return 'pre-signed';
	return params.silentWallet ? 'silent-signature' : 'live-signature';
}

export type AcquisitionState =
	| {step: 'Idle'}
	/**
	 * Waiting for the player to say who pays.
	 *
	 * Only reached when there is a genuine choice. Asking someone to pick when
	 * one of the two is unavailable is a question with one answer.
	 */
	| {step: 'ChoosingPayer'; methods: readonly PaymentMethod[]}
	/** Nothing here can pay, with the reason. */
	| {step: 'NoPaymentMethod'; message: string}
	/**
	 * Waiting for the player to agree, BEFORE anything is signed or spent.
	 *
	 * Reached whenever this acquisition also AUTHORISES this browser, whether or
	 * not a wallet is going to open. Showing it only when one would is the
	 * tempting shortcut and it is wrong: the question "is a window about to
	 * appear" is answered by `signsWithoutPrompt`, which recognises only the
	 * development burner, so an account whose credential was minted at sign-in
	 * gets the dialog anyway AND gets the wording written for a wallet.
	 *
	 * So the split lives in the state rather than deciding whether there is one.
	 * The dialog has a second job that applies to every payer - it restates who
	 * pays and how much, immediately before money moves, and lists what the key
	 * being authorised may do - and `authorisation` is what lets it tell the
	 * truth about the signature in each case.
	 */
	| {
			step: 'Consent';
			bullets: readonly string[];
			/** Who is paying, so the dialog can restate it rather than assume it. */
			payer: `0x${string}`;
			/** What they are about to pay, in wei. */
			total: bigint;
			/**
			 * How the authorisation will be obtained, which is what the dialog is
			 * about and therefore what its words and its button depend on.
			 */
			authorisation: AcquisitionAuthorisation;
	  }
	/**
	 * Asking the owner to authorise this browser. A SIGNATURE, not a
	 * transaction: free, and for an account whose credential was minted at
	 * sign-in not even a prompt.
	 *
	 * Which of those two is happening is carried, because they are different
	 * waits: one the player has to answer in a wallet, one that is over before
	 * they can read about it. Telling the second "confirm in your wallet" names
	 * a window that will never open.
	 */
	| {step: 'Authorising'; authorisation: AcquisitionAuthorisation}
	/** The wallet has been asked to pay; the player may still refuse. */
	| {step: 'Acquiring'}
	/** Paid for. The signer is now registering itself out of its stipend. */
	| {step: 'Registering'}
	/**
	 * An acquisition this browser is not running, but has already paid for.
	 *
	 * Read out of the operations ledger rather than remembered here, which is
	 * what makes it survive the reload that loses everything else. It is the
	 * state a player is in after closing the tab on a transaction that was still
	 * in flight, and the reason it is a STEP rather than a footnote is that
	 * `buy()` must refuse from it: the alternative is charging them twice for
	 * something they are already getting.
	 */
	| {step: 'Pending'; hash?: `0x${string}`; landed: boolean}
	| {step: 'Error'; error: unknown; message: string};

export type AcquisitionStore = Readable<AcquisitionState> & {
	readonly value: AcquisitionState;
	/** Acquire one, in a single transaction. */
	buy(): Promise<void>;
	/** Answer `ChoosingPayer`. */
	choose(method: PaymentMethodId): Promise<void>;
	/** Answer `Consent`: yes, ask my wallet to sign it. */
	confirmConsent(): Promise<void>;
	/** Put an error away without buying. */
	dismiss(): void;
};

export type AcquisitionDeps = Pick<
	Context,
	// The durable record of what this account has sent, which is where an
	// acquisition that outlived its tab is found. See ./pending.ts.
	| 'accountData'
	| 'connection'
	| 'accountExecutor'
	| 'accountBalance'
	| 'gasFee'
	| 'balanceCheck'
	| 'deployments'
	| 'publicClient'
	// The signer registers ITSELF, paying from the stipend the acquisition just
	// sent it. That is what keeps the owner down to one transaction.
	| 'signerExecutor'
	| 'delegation'
	/**
	 * A SECOND, WALLET-ONLY CONNECTION, because the payer is not necessarily the
	 * player. An account that signed in with email or a social login has no
	 * wallet at all and `accountExecutor` reports `cannot-send` for it, so
	 * without this the one thing a new player must do is impossible for them.
	 * See core/connection/remote.ts.
	 */
	| 'payment'
>;

/** The steps a fresh `buy()` may start from. */
function isRestable(step: AcquisitionState['step']): boolean {
	return step === 'Idle' || step === 'Error' || step === 'NoPaymentMethod';
}

/**
 * What the player is shown: this browser's attempt, or the ledger's.
 *
 * THE LOCAL FLOW WINS whenever there is one, because it is more specific: it
 * knows which of "waiting for a signature", "waiting for a wallet" and "the
 * signer is registering" is happening, and it is the only one that can be
 * answered (`choose`, `confirmConsent`). The ledger is consulted only when this
 * browser is doing nothing, which is exactly the case a reload produces.
 *
 * An `Error` therefore also wins, and should: an acquisition whose transaction
 * landed but whose registration failed has a real error to show, and covering
 * it with "still buying" would hide the one thing the player can act on.
 *
 * Pure, and exported for the tests, because it is the whole of the recovery
 * rule and neither half of it is reachable from a unit test otherwise.
 */
export function resolveAcquisitionState(
	local: AcquisitionState,
	pending: PendingAcquisition | undefined,
): AcquisitionState {
	if (local.step !== 'Idle' || !pending) return local;
	return {step: 'Pending', hash: pending.hash, landed: pending.landed};
}

/**
 * Re-read what the account holds once a recovered acquisition is over.
 *
 * One found in the ledger completes with nobody watching: this browser did not
 * send it, so none of the code that normally follows an acquisition runs, and
 * without this the player sits on "finishing what you already paid for" until
 * they reload AGAIN - having already reloaded once, which is how they got here.
 *
 * Its own function, taking only the store it watches, for the same reason
 * `resumeWhenGasArrives` is: it is wiring that acts on the player's behalf,
 * that deserves a test, and that a test should not need an app context for.
 */
export function refreshWhenPendingAcquisitionSettles(params: {
	acquisition: Readable<AcquisitionState>;
	onSettled: () => void;
}): () => void {
	let wasPending = false;
	return params.acquisition.subscribe(($acquisition) => {
		if ($acquisition.step === 'Pending') {
			wasPending = true;
			return;
		}
		// Only a TRANSITION out of it, and only after one was actually seen. The
		// first reading is this browser learning what was already true, and firing
		// on it would re-read the account on every load for nothing.
		if (!wasPending) return;
		wasPending = false;
		params.onSettled();
	});
}

export function createAcquisition(params: {
	deps: AcquisitionDeps;
	/** What this game acquires, and how. The one seam. */
	acquisition: Acquisition;
	/** The account the thing will belong to. */
	owner: Readable<`0x${string}` | undefined>;
	/**
	 * What this app's browser key is for, for the consent step.
	 *
	 * A parameter rather than a context field, because the composition root
	 * already holds the one this app declares and importing it back from there
	 * would be a cycle. Same list the top-up flow shows, from the same source, so
	 * the two cannot describe two different keys.
	 */
	grant: SignerGrant;
	/** Called once it is on chain, so the game's own read can catch up. */
	onAcquired?: () => void;
}): AcquisitionStore {
	const {deps, acquisition, owner} = params;

	/** What THIS browser is doing. Dies with the tab, deliberately. */
	const state = writable<AcquisitionState>({step: 'Idle'});
	let local: AcquisitionState = {step: 'Idle'};
	state.subscribe((v) => (local = v));

	/**
	 * What this ACCOUNT has in flight, which outlives the tab.
	 *
	 * `watchField` is lazy: nothing is read until something subscribes, so this
	 * stays a synchronous, IO-free construction (ADR-0002) and the server never
	 * touches storage. That is also why `value` below resolves on demand rather
	 * than being kept up to date by a permanent subscription here.
	 */
	const pending = derived(deps.accountData.watchField('operations'), ($ops) =>
		findPendingAcquisition({
			operations: $ops,
			contract: acquisition.address,
			functionName: acquisition.functionName,
		}),
	);

	const state$ = derived([state, pending], ([$local, $pending]) =>
		resolveAcquisitionState($local, $pending),
	);

	/**
	 * The same answer the subscribers get, for the code paths that ask directly.
	 *
	 * It matters most for `buy()`: the guard against buying twice is a question
	 * about the ACCOUNT, not about this tab, and asking the local store alone is
	 * the bug this module's recovery exists to fix.
	 */
	function value(): AcquisitionState {
		return resolveAcquisitionState(local, get(pending));
	}

	const total = acquisitionTotal(acquisition);

	/**
	 * How this acquisition will authorise the browser, read off the connection.
	 *
	 * The reading is here and the RULE is in `acquisitionAuthorisation` above, so
	 * the rule can be tested and this stays a translation of three shared readers
	 * into its arguments.
	 */
	function authorisationRoute(): AcquisitionAuthorisation | undefined {
		const $connection = get(deps.connection);
		const {registry} = deps.delegation;
		const account = delegationAccountOf($connection, {
			chainId: registry.chainId,
			contract: registry.address,
		});
		return acquisitionAuthorisation({
			registered: isRegistered(get(deps.delegation)),
			hasSigner: get(deps.signerExecutor).status === 'ready',
			// False when there is no signed-in account to read at all, which is the
			// honest answer: nobody can be asked to sign.
			ownerCanSignLive: account?.canSignLive ?? false,
			silentWallet: signsWithoutPrompt($connection),
		});
	}

	/**
	 * Authorise this browser, without a transaction from the owner.
	 *
	 * Returns the credential, or undefined when there is nothing to authorise.
	 * Gathered BEFORE the transaction on purpose: it is the step the player can
	 * refuse, and refusing it should cost them nothing.
	 *
	 * Takes the route decided at the consent step rather than deciding again: the
	 * player has just been told which of these is about to happen, and a second
	 * reading could disagree with what they read.
	 */
	async function credentialIfNeeded(
		authorisation: AcquisitionAuthorisation | undefined,
	) {
		if (!authorisation) return undefined;

		// RE-READ, because the dialog above sat on screen for as long as the player
		// took to read it, and both of these can change underneath it: another tab
		// can register this signer, and a signer can go away with the account it
		// belongs to. Neither is a failure - there is simply nothing left to
		// authorise - so the acquisition goes ahead without a stipend, exactly as
		// it does for a browser that was already authorised.
		if (isRegistered(get(deps.delegation))) return undefined;

		const $signer = get(deps.signerExecutor);
		if ($signer.status !== 'ready') {
			// No signer means nothing to authorise and nothing to fund. The
			// acquisition still works; the player just plays through their wallet.
			return undefined;
		}

		logger.debug(`authorising: ${authorisation}`);
		state.set({step: 'Authorising', authorisation});
		const {registry} = deps.delegation;
		return {
			delegate: $signer.address,
			credential: await fetchDelegation({
				connection: deps.connection,
				target: {
					chainId: registry.chainId,
					contract: registry.address,
				},
				delegate: $signer.address,
			}),
		};
	}

	/**
	 * Who could pay, and whether there is anything to ask.
	 *
	 * THE PAYER IS NOT NECESSARILY THE PLAYER, which is the whole reason the
	 * template carries a second, wallet-only connection. An account that signed
	 * in with email or a social login has no wallet, `accountExecutor` reports
	 * `cannot-send`, and a flow that assumes otherwise throws "this account
	 * cannot send transactions in this mode" at exactly the moment such a player
	 * is starting. They can still play: somebody connects a wallet and pays, and
	 * the thing is acquired FOR the player regardless. Nothing about it requires
	 * the payer to be the owner, because the owner is an argument rather than
	 * `msg.sender`.
	 *
	 * The SET is computed by `$lib/core/funding`, which the top-up flow already
	 * uses and which is tested on its own. Reusing it rather than writing a
	 * second rule here is what keeps the two from disagreeing about whether an
	 * account can pay, which is the sort of difference a player would experience
	 * as the app contradicting itself.
	 */
	function offeredMethods(): readonly PaymentMethod[] {
		const $account = get(deps.accountExecutor);
		const $balance = get(deps.accountBalance);
		const $gasFee = get(deps.gasFee);
		// `Loaded` or nothing: an unknown fee reserves nothing, which errs towards
		// offering the account and letting the wallet refuse, rather than hiding a
		// payer that can in fact pay.
		const maxFeePerGas =
			$gasFee.step === 'Loaded' ? effectiveGasPrice($gasFee) : 0n;
		const balance =
			$balance.step === 'Loaded' && $balance.value !== undefined
				? $balance.value
				: 0n;

		// What the account could send AFTER the gas of sending it, compared
		// against the whole price plus stipend rather than the price alone: an
		// account that can cover only part of it cannot pay at all.
		//
		// `core/funding`, not arithmetic of our own: keeping a private copy would
		// be keeping a second answer to a question that has one.
		const spendable = spendableBalance({
			balance,
			maxFeePerGas,
			gas: acquisition.gas,
		});

		return paymentMethods({
			accountSpendable: spendable >= total ? spendable : 0n,
			ownerCanSend: $account.status === 'ready',
			walletsAvailable: get(deps.payment.connection).wallets.length,
		});
	}

	/** Resolve a chosen method into something that can send. */
	async function payerFor(method: PaymentMethodId) {
		if (method === 'account') {
			const $account = get(deps.accountExecutor);
			if ($account.status !== 'ready') {
				throw new Error('This account cannot send a transaction.');
			}
			return {
				kind: 'account' as const,
				client: $account.client,
				account: $account.account,
				address: $account.address,
				balance: deps.accountBalance,
			};
		}

		// Disconnect first: @etherplay/connect remembers the last wallet AND the
		// last account, and who pays is routinely a different account from last
		// time, so the picker has to appear. Same reasoning as the top-up flow's.
		await deps.payment.connection.disconnect();
		const $payment = await deps.payment.connection.ensureConnected();
		const address = $payment.account.address;
		return {
			kind: 'wallet' as const,
			client: deps.payment.walletClient,
			account: address,
			address,
			// Built here rather than held in the context, because WHICH wallet pays
			// is chosen inside the wallet and is not known until the line above
			// resolves. Read through the rail's own public client, which is the one
			// pointed at whatever chain that wallet connected to.
			balance: createBalanceStore({
				publicClient: deps.payment.publicClient,
				account: readable(address),
			}),
		};
	}

	/** Start: work out who could pay, and ask only if there is a choice. */
	async function buy() {
		// NEVER TWICE AT ONCE. A second run does not necessarily collide with the
		// first: depending on the game it acquires a second one and charges again.
		// The guard is here rather than in the button because a disabled button is
		// a suggestion and this is the player's money.
		//
		// `value()` and not the local store, which is the whole of the reload fix:
		// after a reload this tab is doing nothing at all, and the only thing that
		// knows something is already paid for is the operations ledger.
		if (!isRestable(value().step)) return;

		if (!get(owner)) {
			state.set({
				step: 'Error',
				error: new Error('not signed in'),
				message: 'Sign in first, so this belongs to somebody.',
			});
			return;
		}

		const offered = offeredMethods();
		const usable = availablePaymentMethods(offered);

		if (usable.length === 0) {
			// A real, reachable state: no wallet on the account and none installed.
			// It gets the honest explanation rather than a disabled button.
			state.set({
				step: 'NoPaymentMethod',
				message: NO_PAYMENT_METHOD_EXPLANATION,
			});
			return;
		}
		if (offered.length === 1) {
			// Genuinely nothing to choose between: one method exists at all.
			await run(usable[0].id);
			return;
		}
		// SHOWN WHENEVER THERE IS MORE THAN ONE METHOD, available or not, rather
		// than only when more than one CAN be used.
		//
		// Skipping to the single usable method looks like a kindness and is not. A
		// player whose account holds nothing goes straight into a wallet picker
		// having never been told that paying from their account was an option, let
		// alone why it was refused. `paymentMethods` gives every entry an
		// `unavailableReason` precisely so it can be shown greyed out WITH the
		// reason, which is the difference between a choice and a closed door.
		state.set({step: 'ChoosingPayer', methods: offered});
	}

	async function choose(method: PaymentMethodId) {
		if (value().step !== 'ChoosingPayer') return;
		await run(method);
	}

	/**
	 * The payer resolved by `run`, held across the consent step.
	 *
	 * Kept rather than re-derived, because re-deriving means calling `payerFor`
	 * again, and for the rail that opens the wallet picker a SECOND time. Asking
	 * someone to choose a wallet twice for one purchase is how they conclude the
	 * first answer was not heard.
	 *
	 * The ROUTE is held with it, for a smaller version of the same reason: it is
	 * what the dialog the player is reading says, so re-deciding it after they
	 * press the button could do something other than what the button promised.
	 */
	let awaitingConsent:
		| {
				payer: Awaited<ReturnType<typeof payerFor>>;
				authorisation: AcquisitionAuthorisation;
		  }
		| undefined;

	async function confirmConsent() {
		if (value().step !== 'Consent' || !awaitingConsent) return;
		const {payer, authorisation} = awaitingConsent;
		awaitingConsent = undefined;
		await execute(payer, authorisation);
	}

	/**
	 * Connect the chosen payer, then ask for consent if this also authorises this
	 * browser.
	 *
	 * THE PAYER IS CONNECTED FIRST, and the order is the whole point. Taking the
	 * delegation signature before connecting makes the sequence: choose "pay with
	 * another wallet", get a signature request out of nowhere, and only then be
	 * asked WHICH wallet. The question the player has just answered is
	 * interrupted by an unrelated one, and the thread between choosing to pay and
	 * picking a payer is cut.
	 *
	 * Connecting immediately keeps that thread. The signature comes after, with a
	 * dialog that restates who is paying and how much, so the consent step
	 * carries the context the wallet picker would otherwise lose.
	 */
	async function run(method: PaymentMethodId) {
		const $owner = get(owner);
		if (!$owner) return;

		try {
			await deps.connection.ensureConnected();

			// Leaves `ChoosingPayer` before the wallet picker opens: the question is
			// answered, and a chooser still on screen behind a picker invites a
			// second answer.
			state.set({step: 'Acquiring'});
			const payer = await payerFor(method);
			logger.debug(`payer connected: ${payer.kind} ${payer.address}`);

			const authorisation = authorisationRoute();
			if (authorisation) {
				awaitingConsent = {payer, authorisation};
				state.set({
					step: 'Consent',
					bullets: consentBullets(params.grant),
					payer: payer.address,
					// Restated here because the player last saw a figure on a button,
					// several dialogs ago, and is one press away from spending it.
					total,
					authorisation,
				});
				return;
			}

			await execute(payer, undefined);
		} catch (error) {
			fail(error);
		}
	}

	async function execute(
		payer: Awaited<ReturnType<typeof payerFor>>,
		authorisationRouteChosen: AcquisitionAuthorisation | undefined,
	) {
		const $owner = get(owner);
		if (!$owner) return;

		try {
			const deployments = get(deps.deployments);

			// The signature, now that the player has agreed to it and knows who is
			// paying. Still before the transaction: it is free and refusable, and it
			// decides whether the call needs to carry a stipend at all.
			const authorised = await credentialIfNeeded(authorisationRouteChosen);

			// Only fund a signer that is going to be registered: see `stipendFor`.
			const {stipendTo, stipend} = stipendFor({
				delegate: authorised?.delegate,
				stipend: acquisition.stipend,
			});

			logger.debug(
				`acquiring: price=${acquisition.price} stipend=${stipend} to=${stipendTo ?? 'nobody'}`,
			);
			state.set({step: 'Acquiring'});

			const call = acquisition.request({owner: $owner, stipendTo, stipend});
			const request = {
				// The rail's own pair, not the call's, so that what is SENT and what
				// is later RECOGNISED in the ledger cannot be two different things.
				address: acquisition.address,
				functionName: acquisition.functionName,
				abi: call.abi,
				args: call.args,
				value: call.value,
				account: payer.account,
			};

			// EVERY payer goes through the balance check, including a payment
			// wallet. Skipping it for the rail produces a bare "does not have enough
			// funds" with no remedy: `ensureCanAfford` is the thing that opens the
			// insufficient-funds modal, names WHO is short, offers the faucet, and
			// waits for the balance to catch up afterwards. A payer that cannot pay
			// should meet all of that, not a red sentence. One cast, at the one
			// place the mismatch is: viem types `writeContract` for a call site that
			// names the function literally, and the ABI and entry point here are
			// values. Same cast, same reason, as the top-up flow's registration
			// writer.
			const checked = await deps.balanceCheck.ensureCanAfford(
				{contract: request as never},
				{balance: payer.balance, sender: payer.address},
			);
			const hash = await (
				payer.client as unknown as {
					writeContract: (r: unknown) => Promise<`0x${string}`>;
				}
			).writeContract(checked);

			// Waiting matters here. `writeContract` resolves on BROADCAST, and the
			// next two things that happen both depend on this having landed: the
			// signer spends the stipend to register, and the caller re-reads what
			// the account holds in order to unlock the board.
			const receipt = await deps.publicClient.waitForTransactionReceipt({hash});
			if (receipt.status === 'reverted') {
				throw new Error('The transaction was rejected by the contract.');
			}

			// It exists from here on, so the player has got what they paid for
			// whatever happens next.
			if (authorised) {
				// No prompt for this one: the signer sends it itself out of the
				// stipend that just arrived. Worth a line, because on screen it is a
				// wait the player was never asked about.
				logger.debug(`registering: signer submits its own delegation`);
				state.set({step: 'Registering'});
				const $signer = get(deps.signerExecutor);
				if ($signer.status === 'ready') {
					await submitRegistration({
						registry: deps.delegation.registry,
						client: $signer.client,
						publicClient: deps.publicClient,
						account: $signer.account,
						request: registrationRequest({
							owner: $owner,
							delegate: authorised.delegate,
							// The signature variant forces the payee to the delegate, and
							// the delegate is already funded, so there is nothing to send.
							value: 0n,
							credential: authorised.credential,
						}),
					});
					await deps.delegation.update();
				}
			}

			state.set({step: 'Idle'});
			params.onAcquired?.();
		} catch (error) {
			fail(error);
		}
	}

	/**
	 * One place decides what a failure is worth saying.
	 *
	 * Shared by `run` and `execute` because the consent step splits one attempt
	 * across two functions, and a rejection means the same thing whichever half
	 * it happened in.
	 */
	function fail(error: unknown) {
		logger.debug(`failed at step "${value().step}": ${String(error)}`);
		// REJECTING IS AN ANSWER, NOT A FAULT. The player pressed no in their
		// wallet, which is a decision they made deliberately and already know
		// about; reporting it back to them as an error, in viem's words, is the
		// app telling them off for using it correctly. Back to Idle, so the button
		// simply reads as ready again.
		if (isUserRejectionError(error)) {
			state.set({step: 'Idle'});
			return;
		}
		// ALREADY REPORTED, and far better than this could. `ensureCanAfford`
		// throws this only after the insufficient-funds modal has named the
		// account, shown the shortfall, offered the faucet and waited for the
		// balance to arrive; the player then chose to stop. Painting a summary
		// underneath is the app telling them again, worse, in a panel with no
		// remedy on it. Same reasoning as the rejection above.
		if (error instanceof InsufficientFundsError) {
			state.set({step: 'Idle'});
			return;
		}
		state.set({
			step: 'Error',
			error,
			// SUMMARISED, not `error.message`. A viem error message is the whole
			// request pretty-printed - from, to, value, data, gas, nonce, the ABI
			// signature, every argument, a docs link and a version - and rendering
			// it verbatim into a panel over the board is what happens by default.
			// `txErrorSummary` is the app's own one-sentence version, and the full
			// text is still reachable through the error-details modal.
			message: txErrorSummary(error),
		});
	}

	return {
		subscribe: state$.subscribe,
		get value() {
			return value();
		},
		buy,
		choose,
		confirmConsent,
		dismiss: () => state.set({step: 'Idle'}),
	};
}
