/**
 * HOTSEAT: several people at one device, each their own account, against one
 * embedded world, passing the device between them.
 *
 * WHAT THIS FILE OWNS is WHOSE TURN IT IS and the HANDOVER between them: which
 * person the device belongs to now, the screen that covers everything while it
 * changes hands, and the switch of the world's one connection to the next
 * person's account. What each person PLAYS is the game, unchanged: the same
 * page, the same submission, the same commit-reveal code path as online (the
 * template's D4), which is the whole reason each person is a real account
 * rather than an identity under a shared one.
 *
 * WHAT IT HIDES, AND FROM WHOM. The shared SCREEN: nothing of one person's plan
 * is on screen, or mounted at all, while the next person holds the device (the
 * route renders the handover IN PLACE of the game, so the game's components and
 * their state are gone, not hidden under a modal), and after the switch the
 * game reads the new account's data only. It does NOT hide anything from a
 * person with the developer tools: every account and its data are in this
 * browser, and the revealer holds each turn's calldata in memory. That is the
 * limit D4 accepts, and the honest one for a shared device.
 *
 * WHOSE TURN IT IS COMES FROM THE CHAIN, never from memory: the next person is
 * the first, in seat order, with no commitment for the current cycle. So a
 * reload resumes at the right person, and always lands on the handover screen
 * rather than straight into somebody's plan.
 *
 * WHO REVEALS is the world's local revealer (`$lib/game/core/local-revealer`),
 * handed each turn at commit. Its queue is in memory, so after a reload it holds
 * nothing it was given before; for a turn committed and not revealed on chain
 * that it does not hold, this switches to that person BEHIND the covering
 * screen and reveals as them, with nothing rendered (H1-7 of stratagems' plan).
 * Under the manual policy nothing else would: a turn handed to a scheduler
 * never reveals itself there, and the cycle waits for it for ever.
 */
import {derived, get, writable, type Readable} from 'svelte/store';
import {
	createPublicClient,
	custom,
	type Abi,
	type Chain,
	type PublicClient,
} from 'viem';
import type {ChainProvider} from '$lib/game/core/played';
import type {Context} from '$lib/context/types';
import type {AccountDataLifecycle} from '$lib/account/lifecycle';

/** One person at the device, in seat order. */
export type HotseatHuman = {
	/** Their account in the world's wallet. */
	address: `0x${string}`;
	/** Their identity as the contract keys it. */
	player: bigint;
	/** What the handover calls them. */
	label: string;
};

export type HotseatState =
	/** No hotseat here (one person, or no world). The game is shown. */
	| {step: 'Inactive'}
	/** Reading the chain, before the first answer. Covered. */
	| {step: 'Opening'}
	/** The device is to be handed to `to`, who presses to begin. Covered. */
	| {step: 'Passing'; to: number; label: string}
	/** Switching the world's connection to `to`. Covered. */
	| {step: 'Switching'; to: number; label: string}
	/** `seat` has the device. The game is shown. */
	| {step: 'Playing'; seat: number; label: string}
	/** Everyone here has committed; the cycle is closing. Covered. */
	| {step: 'Resolving'};

/** What the hotseat reads of the chain on each pass. */
export type HotseatChainView = {
	cycleNumber: number;
	commiting: boolean;
	/**
	 * Per person, in seat order: whether they hold a commitment FOR THIS CYCLE
	 * that is not yet fully revealed. In the commit phase that is "has
	 * committed"; in the reveal phase, "is still to reveal".
	 */
	outstanding: readonly boolean[];
};

export type Hotseat = Readable<HotseatState> & {
	/** The person the device was passed to presses this. */
	begin(): Promise<void>;
	/** Follow the chain until stopped. */
	start(): () => void;
	/** One pass now. */
	check(): Promise<void>;
};

/**
 * Read whose turn it is from the commit-reveal base's own getters: `getCycle`,
 * and `getCommitment` per person (a fully revealed commitment's `cycleNumber`
 * goes back to 0, `CommitReveal.sol`).
 */
export function createHotseatChainReader(params: {
	provider: ChainProvider;
	chain: Chain;
	contract: {address: `0x${string}`; abi: Abi};
	players: readonly bigint[];
}): () => Promise<HotseatChainView> {
	const {contract, players} = params;
	const client: PublicClient = createPublicClient({
		chain: params.chain,
		transport: custom(params.provider as never),
	});
	return async () => {
		const cycle = (await client.readContract({
			address: contract.address,
			abi: contract.abi,
			functionName: 'getCycle',
		})) as {cycleNumber: bigint | number; commiting: boolean};
		const cycleNumber = Number(cycle.cycleNumber);
		const outstanding = await Promise.all(
			players.map(async (player) => {
				const commitment = (await client.readContract({
					address: contract.address,
					abi: contract.abi,
					functionName: 'getCommitment',
					args: [player],
				})) as {cycleNumber: bigint | number};
				return Number(commitment.cycleNumber) === cycleNumber;
			}),
		);
		return {cycleNumber, commiting: cycle.commiting, outstanding};
	};
}

/** The world's connection: the context's own. */
type WorldConnection = Context['connection'];

/**
 * The two addresses a switch watches, read loosely: the connection's state is a
 * union over every mechanism and step, and only a wallet's carries them.
 */
function addressesOf(state: unknown): {
	step: string;
	wallet: string | undefined;
	signedIn: string | undefined;
} {
	const c = state as {
		step: string;
		mechanism?: {address?: string};
		account?: {address?: string};
	};
	return {
		step: c.step,
		wallet: c.mechanism?.address?.toLowerCase(),
		signedIn:
			c.step === 'SignedIn' ? c.account?.address?.toLowerCase() : undefined,
	};
}

function until<T>(
	store: Readable<T>,
	predicate: (value: T) => boolean,
	what: string,
	timeoutMs = 30_000,
): Promise<T> {
	return new Promise((resolve, reject) => {
		let done = false;
		let unsubscribe: (() => void) | undefined;
		const timer = setTimeout(() => {
			done = true;
			unsubscribe?.();
			reject(new Error(`the hotseat timed out waiting for ${what}`));
		}, timeoutMs);
		unsubscribe = store.subscribe((value) => {
			if (done || !predicate(value)) return;
			done = true;
			clearTimeout(timer);
			queueMicrotask(() => unsubscribe?.());
			resolve(value);
		});
	});
}

/**
 * SWITCH THE WORLD'S ONE CONNECTION TO `address`, and sign in as it.
 *
 * The wallet selects the account and announces it; the world's connection is
 * built with `useCurrentAccount: 'always'`, so it reconnects as that account by
 * itself, with no picker, and stops at `WalletConnected`; the world then asks
 * for the signature, as its boot does (a wallet the world generated, which
 * auto-approves), and the local signer derived from it is that person's
 * browser key, the same one every time. Pinned by jolly-roger's
 * `test/lib/embedded/wallet-switch.svelte.test.ts`.
 */
export async function signInAs(params: {
	connection: WorldConnection;
	select: (address: `0x${string}`) => void;
	address: `0x${string}`;
}): Promise<void> {
	const {connection} = params;
	const address = params.address.toLowerCase();
	const signedIn = (c: unknown) => addressesOf(c).signedIn === address;
	if (signedIn(get(connection))) return;
	params.select(params.address);
	await until(
		connection,
		(c) => {
			const now = addressesOf(c);
			return (
				now.wallet === address &&
				(now.step === 'WalletConnected' || now.step === 'SignedIn')
			);
		},
		`the connection to follow ${params.address}`,
	);
	if (connection.targetStep !== 'SignedIn') return;
	if (!signedIn(get(connection))) await connection.requestSignature();
	await until(connection, signedIn, `the signature of ${params.address}`);
}

/**
 * WHETHER `address`'s ACCOUNT DATA HAS LOADED: ready, or failed (the game then
 * says it could not read the data, which a covering screen would hide). The
 * account is compared, not only the status: right after a switch the lifecycle
 * can still be the PREVIOUS person's `ready`.
 */
function dataLoadedFor(
	lifecycle: AccountDataLifecycle,
	address: `0x${string}`,
): boolean {
	return (
		(lifecycle.status === 'ready' || lifecycle.status === 'error') &&
		lifecycle.account.toLowerCase() === address.toLowerCase()
	);
}

/** The account a connection is signed in as, lowercased, or undefined. */
export function signedInAs(
	connection: WorldConnection,
): Readable<string | undefined> {
	return derived(
		connection,
		($connection) => addressesOf($connection).signedIn,
	);
}

export function createHotseat(params: {
	humans: readonly HotseatHuman[];
	/** Make `address` the account the world plays as (see {@link signInAs}). */
	switchTo: (address: `0x${string}`) => Promise<void>;
	read: () => Promise<HotseatChainView>;
	/** The world's revealer: whether it holds a person's turn for a cycle. */
	revealer: {holds(player: bigint, cycleNumber: number): boolean};
	/** The active person's submission, which follows the account. */
	submission: Readable<{step: string}> & {reveal(): Promise<void>};
	/**
	 * The account the world's connection is signed in as right now (any case),
	 * or undefined. The game is shown only while it is the account of the
	 * person who has the device: see {@link signedInAs}.
	 */
	signedIn: Readable<string | undefined>;
	/**
	 * The world's account data (the context's `accountData`): the game is shown
	 * only once the data of the person with the device has loaded, since until
	 * then their submission reads `Idle` and drops every plan
	 * (`SubmissionStore.ready`), so a board shown earlier ignores their clicks.
	 */
	accountData: {lifecycle$: Readable<AccountDataLifecycle>};
	pollInterval?: number;
}): Hotseat {
	const {humans, revealer, submission} = params;
	const pollInterval = params.pollInterval ?? 1000;
	const state = writable<HotseatState>(
		humans.length < 2 ? {step: 'Inactive'} : {step: 'Opening'},
	);
	/** Set while a switch or a recovery runs: nothing else may move the device. */
	let busy = false;
	/** Recoveries tried, by cycle and person, so a failure is not retried in a loop. */
	const recovered = new Set<string>();

	/**
	 * THE GAME IS SHOWN ONLY WHILE THE CONNECTION IS THE PERSON WITH THE DEVICE,
	 * decided synchronously from the connection rather than after a poll. A
	 * connection that moves to somebody else's account while a person plays (it
	 * has been measured to: `@etherplay/connect`'s auto-connect, started when
	 * the page loaded with the previous person stored as the last account,
	 * landing after a later switch) would otherwise put that somebody's turn on
	 * screen; covered in the same update, it never reaches the game, and the
	 * switch below puts the right account back.
	 *
	 * AND ONLY ONCE THAT PERSON'S ACCOUNT DATA HAS LOADED (stratagems' port plan,
	 * step H1b): until then their submission reads `Idle` and drops every plan,
	 * so a board shown earlier ignores their clicks without a word. The handover
	 * stays `Switching` meanwhile, as H1-8 decided it would.
	 */
	const shown = derived(
		[state, params.signedIn, params.accountData.lifecycle$],
		([current, account, lifecycle]) => {
			if (
				current.step === 'Playing' &&
				(account?.toLowerCase() !==
					humans[current.seat].address.toLowerCase() ||
					!dataLoadedFor(lifecycle, humans[current.seat].address))
			) {
				return {
					step: 'Switching',
					to: current.seat,
					label: current.label,
				} satisfies HotseatState;
			}
			return current;
		},
	);

	/** Put the right account back under the person who has the device. */
	async function heal(): Promise<void> {
		const current = get(state);
		if (current.step !== 'Playing' || busy) return;
		const expected = humans[current.seat].address;
		if (get(params.signedIn)?.toLowerCase() === expected.toLowerCase()) return;
		busy = true;
		try {
			await params.switchTo(expected);
		} catch (error) {
			console.error('the hotseat could not put the account back', error);
		} finally {
			busy = false;
		}
	}

	function passTo(index: number): void {
		if (index < 0) {
			state.set({step: 'Resolving'});
			return;
		}
		state.set({step: 'Passing', to: index, label: humans[index].label});
	}

	async function recover(view: HotseatChainView): Promise<void> {
		for (const [index, human] of humans.entries()) {
			if (!view.outstanding[index]) continue;
			if (revealer.holds(human.player, view.cycleNumber)) continue;
			const key = `${view.cycleNumber}:${index}`;
			if (recovered.has(key)) continue;
			recovered.add(key);
			busy = true;
			try {
				await params.switchTo(human.address);
				// The submission reloads for the new identity; its committed turn
				// is what it reveals.
				await until(
					submission,
					(s) => s.step === 'Committed' || s.step === 'Revealed',
					`${human.label}'s committed turn to load`,
				);
				if (get(submission).step === 'Committed') await submission.reveal();
			} catch (error) {
				console.error(`the hotseat could not reveal for ${human.label}`, error);
			} finally {
				busy = false;
			}
		}
	}

	async function check(): Promise<void> {
		if (humans.length < 2 || busy) return;
		await heal();
		if (busy) return;
		let view: HotseatChainView;
		try {
			view = await params.read();
		} catch {
			return;
		}
		if (busy) return;
		const current = get(state);
		const next = view.outstanding.findIndex((committed) => !committed);
		if (view.commiting) {
			if (current.step === 'Playing') {
				if (view.outstanding[current.seat]) passTo(next);
				return;
			}
			if (current.step === 'Passing') {
				if (view.outstanding[current.to]) passTo(next);
				return;
			}
			if (current.step === 'Switching') return;
			passTo(next);
			return;
		}
		if (current.step !== 'Resolving') state.set({step: 'Resolving'});
		await recover(view);
	}

	async function begin(): Promise<void> {
		const current = get(state);
		if (current.step !== 'Passing' || busy) return;
		busy = true;
		state.set({step: 'Switching', to: current.to, label: current.label});
		try {
			await params.switchTo(humans[current.to].address);
			state.set({step: 'Playing', seat: current.to, label: current.label});
		} catch (error) {
			console.error('the hotseat could not hand the device over', error);
			state.set(current);
		} finally {
			busy = false;
		}
	}

	function start(): () => void {
		if (humans.length < 2 || typeof window === 'undefined') return () => {};
		void check();
		const timer = setInterval(() => void check(), pollInterval);
		// The active person's commit is the usual reason to move the device on;
		// noticing it at once saves a poll.
		const unsubscribe = submission.subscribe(($submission) => {
			if ($submission.step === 'Committed') void check();
		});
		const unsubscribeAccount = params.signedIn.subscribe(() => void heal());
		return () => {
			clearInterval(timer);
			unsubscribe();
			unsubscribeAccount();
		};
	}

	return {subscribe: shown.subscribe, begin, start, check};
}

/**
 * THE HOTSEAT ON SCREEN NOW, for the route: app-scoped, like the world that sets
 * it, and read by the byte-identical offline route without knowing which game's
 * world set it. A world with no hotseat never sets it, and it reads `Inactive`.
 */
const shown = writable<HotseatState>({step: 'Inactive'});
let active: Hotseat | undefined;
let stopShowing: (() => void) | undefined;

export const hotseat: Readable<HotseatState> & {begin(): Promise<void>} = {
	subscribe: shown.subscribe,
	begin: () => active?.begin() ?? Promise.resolve(),
};

/** Show this hotseat (a world's boot calls it once). */
export function showHotseat(next: Hotseat | undefined): void {
	stopShowing?.();
	active = next;
	stopShowing = next?.subscribe((value) => shown.set(value));
	if (!next) shown.set({step: 'Inactive'});
}
