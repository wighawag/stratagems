import {
	createPublicClient,
	createWalletClient,
	custom,
	type Abi,
	type Account,
	type Chain,
	type PublicClient,
} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import type {Readable} from 'svelte/store';

/**
 * PLAYING THE SEATS NOBODY IS SITTING IN: the half of that job that is not a
 * game's own.
 *
 * WHY A GAME NEEDS ONE AT ALL. Under a cycle that waits for everyone, a
 * waited-for member that never acts does not make a quiet game, it makes a
 * FROZEN one, for the human as well: nothing advances until every member has
 * committed, and then until every one of them has revealed. So a seat whose
 * occupant is the machine (`../lobby/seats.ts`) has to be acted for, or it must
 * not be enrolled.
 *
 * WHAT IS HERE IS WHAT TWO GAMES WROTE IDENTICALLY, AND NOTHING ELSE. Two
 * offline worlds in this tree were measured function by function against each
 * other: a keyring that sends and waits, a loop that serialises passes, and a
 * subscription that pokes the loop when the human acts came out the same to the
 * character. What they DISAGREED about - how a turn is derived, whether a reveal
 * is one call or a chain of chunks, and what settling a missed reveal COSTS -
 * is exactly what a shared `createPlayedSeats` would have had to define, so
 * there is no such function here. Each game keeps its own pass and hands it to
 * {@link createSerialisedLoop}.
 *
 * THE DEFERRAL IS THE POINT, and the honest reason for it is that the second
 * implementation was written by PORTING the first: the agreement in the hundred
 * lines below is partly inherited rather than converged, so the three
 * disagreements are the stronger evidence and they say "not yet". The third game
 * is the cheap data point and it is next in the porting order.
 *
 * NOTHING HERE NAMES A GAME, A CONTRACT OR A STAKE. It takes a contract as a
 * parameter, sends what it is handed, and has no opinion about what a turn is.
 */

/**
 * What a played seat needs of a chain: one async method.
 *
 * NAMED RATHER THAN IMPORTED, and it is deliberately not the embedded chain's
 * type even though it is structurally the same. A seat the machine plays needs a
 * provider, not a chain in the tab: an offline world is one caller, and the same
 * loop against a real node would want nothing else. Structural typing means a
 * game hands over whichever provider it has and neither side declares a
 * dependency on the other.
 */
export type ChainProvider = {
	request(args: {method: string; params?: unknown}): Promise<unknown>;
};

/**
 * A ring of local keys that sends one call at a time and WAITS FOR INCLUSION.
 *
 * The narrow thing both games agreed the shared piece would be, and the one
 * thing that had been written three times: "send this request as this key, wait
 * for inclusion, throw on revert". The app's own adapter is deliberately not
 * this and must not be made into it - it resolves one connection and one
 * signer off the app context, which is what makes it the single place a node
 * error is classified, and a played seat is a different key acting for a
 * different identity.
 */
export type PlayedKeys = {
	/**
	 * The client the waiting is done with, exposed so that a game's own reads go
	 * through the same one rather than building a second against the same
	 * provider.
	 */
	publicClient: PublicClient;
	/**
	 * Send one call as one key, and do not resolve until a block holds it.
	 *
	 * `request` is merged over the contract, so a caller passes `functionName`,
	 * `args` and optionally `gas`. It throws when the receipt says reverted.
	 */
	send(key: `0x${string}`, request: Record<string, unknown>): Promise<void>;
	/**
	 * How many calls have been BROADCAST since this ring was built.
	 *
	 * A counter rather than a flag, so a caller can ask "did anything happen
	 * during that pass" by comparing two readings and nothing has to be reset.
	 * It counts a broadcast rather than an inclusion on purpose: a call that
	 * reverts is still something that happened, and the throw is how the caller
	 * hears about it.
	 */
	sends(): number;
};

export function createPlayedKeys(params: {
	provider: ChainProvider;
	/**
	 * The chain, as viem needs it: an id, a name and a currency.
	 *
	 * Built by the caller out of whatever it knows rather than cast out of a
	 * deployment record, because a record's type is the build-time literal one.
	 */
	chain: Chain;
	/** Where the calls go. One contract, which is what both games send to. */
	contract: {address: `0x${string}`; abi: Abi};
}): PlayedKeys {
	const {provider, chain, contract} = params;

	const publicClient = createPublicClient({
		chain,
		transport: custom(provider as never),
	});

	// One viem account and one wallet client per key, built once: deriving an
	// account from a key is elliptic-curve work, and a pass that rebuilt three of
	// them once a second would be the most expensive thing in this file.
	const wallets = new Map<
		`0x${string}`,
		{account: Account; client: ReturnType<typeof createWalletClient>}
	>();
	function walletFor(key: `0x${string}`) {
		let wallet = wallets.get(key);
		if (!wallet) {
			const account = privateKeyToAccount(key);
			wallet = {
				account,
				client: createWalletClient({
					account,
					chain,
					transport: custom(provider as never),
				}),
			};
			wallets.set(key, wallet);
		}
		return wallet;
	}

	let sends = 0;

	/**
	 * SENT AND WAITED FOR, one at a time, like every other write in these games.
	 *
	 * `writeContract` resolves on BROADCAST, so without the receipt a reverted
	 * commitment would look like a made one and the caller would go on to reveal
	 * against nothing. It matters more here than in an app: NOBODY IS WATCHING
	 * these seats, so a failure they do not notice is a cycle that never closes.
	 */
	async function send(
		key: `0x${string}`,
		request: Record<string, unknown>,
	): Promise<void> {
		const wallet = walletFor(key);
		const hash = await wallet.client.writeContract({
			...contract,
			chain: null,
			account: wallet.account,
			...request,
		} as never);
		sends++;
		const receipt = await publicClient.waitForTransactionReceipt({hash});
		if (receipt.status === 'reverted') {
			throw new Error(
				`a played seat's ${String(request.functionName)} was rejected by the contract`,
			);
		}
	}

	return {publicClient, send, sends: () => sends};
}

/**
 * How often a played seat looks at the chain, in milliseconds.
 *
 * THE SAME INTERVAL AS THE CLIENT THAT PUSHES THE CYCLE, because it is the same
 * job: both spend somebody's gas, unprompted, to keep a cycle that has no clock
 * turning. It is a BACKSTOP rather than the thing that makes a round quick -
 * {@link pokeWhenTheHumanActs} is - and that is measured rather than hoped for:
 * at 250ms a round measured 115-277ms in a browser and at 1000ms it measured
 * 114-233ms, which is no difference at all and four times the reads.
 */
const DEFAULT_POLL_INTERVAL = 1000;

export type SerialisedLoop = {
	/**
	 * One pass.
	 *
	 * Exposed so a test can drive a world without timers, and so a caller can
	 * poke at a moment it knows is interesting - see {@link pokeWhenTheHumanActs}.
	 */
	tick(): Promise<void>;
	/** Begin watching. Returns the teardown. */
	start(): () => void;
};

/**
 * ONE PASS AT A TIME, AND A SECOND ONE IF SOMETHING ASKED WHILE IT RAN.
 *
 * Serialising is obvious: two passes in flight would send two commitments for
 * one member at one nonce. QUEUEING the second is the half that is not, and it
 * is what makes a poke reliable. A pass takes as long as the transactions in it,
 * so a poke arriving mid-pass is exactly the LIKELY case - the human's commit
 * lands while these seats are still looking at the phase it just changed - and a
 * poke that was DROPPED would fall back to the poll, which is the second of
 * latency the poke exists to remove. It cannot spin: a pass that finds nothing
 * to do sends nothing and the flag is only set by a caller.
 */
export function createSerialisedLoop(params: {
	/**
	 * Look at the chain and act for whoever owes something.
	 *
	 * Resolves TRUE if the pass sent anything, which is what {@link onActed}
	 * fires on. A game usually answers it by comparing {@link PlayedKeys.sends}
	 * either side of the work.
	 *
	 * It must not reject for anything a retry would fix. A failed pass is not an
	 * error anybody can act on - these seats have no UI - and the next pass sees
	 * the same chain and tries again, which is right for every transient cause (a
	 * commit that lost a race with somebody else's advance, most of all).
	 */
	pass: () => Promise<boolean>;
	/**
	 * Called after a pass that sent something.
	 *
	 * The reason it exists is measured rather than tidy: a played commit is
	 * exactly the moment unanimity may have been completed, and the client that
	 * pushes the cycle only finds out on its own one-second poll. Handing it back
	 * lets the caller ask immediately.
	 */
	onActed?: () => void;
	/** How often to look. Defaults to {@link DEFAULT_POLL_INTERVAL}. */
	pollInterval?: number;
}): SerialisedLoop {
	const pollInterval = params.pollInterval ?? DEFAULT_POLL_INTERVAL;
	let running = false;
	let wanted = false;

	async function tick(): Promise<void> {
		if (running) {
			wanted = true;
			return;
		}
		running = true;
		try {
			do {
				wanted = false;
				const acted = await params.pass();
				if (acted) params.onActed?.();
			} while (wanted);
		} finally {
			running = false;
		}
	}

	function start(): () => void {
		// Off-browser nothing polls: a server render must not perform IO or leave
		// a timer behind. See ADR-0002.
		if (typeof window === 'undefined') return () => {};
		void tick();
		const timer = setInterval(() => void tick(), pollInterval);
		return () => clearInterval(timer);
	}

	return {tick, start};
}

/**
 * Look at the chain the moment the HUMAN's own turn lands.
 *
 * WHY IT IS WORTH A SUBSCRIPTION RATHER THAN A SHORTER POLL. Under the manual
 * policy a round is a commit each, an advance, a reveal each and an advance, and
 * every one of those steps is somebody noticing that the previous one happened.
 * Two pollers in series - the played seats on their interval, the advance client
 * on its second - is most of what a round costs, and the cheapest term to remove
 * is the one the browser already knows about: its own submission reaching
 * `Committed` or `Revealed`.
 *
 * IT TAKES A `Readable<{step: string}>` AND KNOWS NOTHING ELSE. The two states
 * it watches for are the framework's own submission states, and matching them by
 * name rather than by importing the union is what lets this sit under a loop that
 * has no idea what a game is.
 */
export function pokeWhenTheHumanActs(params: {
	loop: Pick<SerialisedLoop, 'tick'>;
	submission: Readable<{step: string}>;
}): () => void {
	return params.submission.subscribe(($submission) => {
		if ($submission.step === 'Committed' || $submission.step === 'Revealed') {
			void params.loop.tick();
		}
	});
}
