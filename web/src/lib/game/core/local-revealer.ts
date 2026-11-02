/**
 * THE LOCAL REVEALER: who sends the reveals of the people at one device
 * (hotseat), so nobody has to take the device back to reveal.
 *
 * REVEALING IS A ROLE, NOT A NEW SEAM (the template's D4). Every contract on the
 * commit-reveal base takes the player as an argument of `reveal` and checks the
 * hash, not the sender, so "somebody else sends your reveal" is already the
 * design and fuzd is one implementation of it. This is another, through the
 * same `RevealScheduler` seam: handed each turn's reveal transactions AT COMMIT
 * TIME, because once a turn's secret sits in a player's (possibly encrypted)
 * account data, only its owner can read it back.
 *
 * IT HOLDS ITS OWN KEY AND PAYS FOR THE REVEALS, so they are charged to neither
 * whoever happened to commit last nor anybody's stake, and it asks for no
 * payment (`prepare` answers nothing to pay).
 *
 * IT WATCHES THE CHAIN, NOT A CLOCK. It is built for a manually advanced chain
 * (an embedded world), where a request carries no `revealDueAt`, and it sends a
 * turn's reveal as soon as the chain says that turn's cycle is in its reveal
 * phase. A turn whose cycle the chain has left behind is dropped: it can no
 * longer be revealed, and the missed-reveal settlement is the game's.
 *
 * ITS QUEUE IS IN MEMORY ONLY, deliberately (H1-7 of stratagems' port plan).
 * Persisting it would be a fourth store beside the world's chain and its
 * records, which nothing keeps coherent with them, and its record would be a
 * wire. A reload therefore loses what it held, and `holds` is how the handover
 * (`$lib/game/lobby/hotseat`) finds out and reveals as that person itself.
 *
 * WHAT IT HOLDS IS CALLDATA THAT OPENS A COMMITMENT: what hotseat hides is the
 * shared SCREEN, and nothing here is ever rendered.
 */
import {
	createPublicClient,
	createWalletClient,
	custom,
	type Abi,
	type Chain,
} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {createSerialisedLoop, type ChainProvider} from './played';
import type {
	PlayerIdentity,
	RevealScheduler,
	RevealTransaction,
	SchedulerPayment,
} from './seams';

const NOTHING_TO_PAY: SchedulerPayment = {
	payee: '0x0000000000000000000000000000000000000000',
	value: 0n,
};

export type LocalRevealer<TIdentity extends PlayerIdentity = PlayerIdentity> = {
	/** What a commit hands the turn to. */
	scheduler: RevealScheduler<TIdentity>;
	/**
	 * Whether this revealer has (or had) this turn: held, or already sent. False
	 * after a reload for every turn committed before it.
	 */
	holds(identity: TIdentity, cycleNumber: number): boolean;
	/** One pass now, serialised with every other. */
	tick(): Promise<void>;
	/** Poll the chain until stopped. */
	start(): () => void;
	/** How many transactions it has sent, for tests and diagnostics. */
	sends(): number;
};

type Held = {cycleNumber: number; transactions: readonly RevealTransaction[]};

function keyOf(identity: PlayerIdentity, cycleNumber: number): string {
	return `${cycleNumber}:${String(identity).toLowerCase()}`;
}

export function createLocalRevealer<
	TIdentity extends PlayerIdentity = PlayerIdentity,
>(params: {
	provider: ChainProvider;
	chain: Chain;
	/** The revealer's own funded key. */
	privateKey: `0x${string}`;
	/** The game, for `getCycle` (the commit-reveal base's). */
	contract: {address: `0x${string}`; abi: Abi};
	/** After a pass that sent something: a reveal may complete the cycle. */
	onActed?: () => void;
	/** Where the cycle is read from; the game's `getCycle` when omitted (tests replace it). */
	readCycle?: () => Promise<{cycleNumber: number; commiting: boolean}>;
	pollInterval?: number;
}): LocalRevealer<TIdentity> {
	const {provider, chain, contract} = params;
	const account = privateKeyToAccount(params.privateKey);
	const publicClient = createPublicClient({
		chain,
		transport: custom(provider as never),
	});
	const walletClient = createWalletClient({
		account,
		chain,
		transport: custom(provider as never),
	});

	const queue = new Map<string, Held>();
	const handled = new Set<string>();
	let sent = 0;

	async function readCycleOnChain(): Promise<{
		cycleNumber: number;
		commiting: boolean;
	}> {
		const cycle = (await publicClient.readContract({
			address: contract.address,
			abi: contract.abi,
			functionName: 'getCycle',
		})) as {cycleNumber: bigint | number; commiting: boolean};
		return {
			cycleNumber: Number(cycle.cycleNumber),
			commiting: cycle.commiting,
		};
	}

	const readCycle = params.readCycle ?? readCycleOnChain;

	async function reveal(held: Held): Promise<void> {
		// One chunk after another, each waited for: the head after chunk `i` is
		// what chunk `i + 1` opens, as the adapter's own reveal does.
		for (const transaction of held.transactions) {
			const hash = await walletClient.sendTransaction({
				account,
				chain: null,
				to: transaction.to,
				data: transaction.data,
				gas: transaction.gas,
			});
			sent++;
			const receipt = await publicClient.waitForTransactionReceipt({hash});
			if (receipt.status === 'reverted') {
				throw new Error('the contract refused a reveal the revealer held');
			}
		}
	}

	async function pass(): Promise<boolean> {
		if (queue.size === 0) return false;
		const cycle = await readCycle();
		let acted = false;
		for (const [key, held] of [...queue]) {
			if (held.cycleNumber < cycle.cycleNumber) {
				// Too late: the chain has moved past this turn's cycle.
				queue.delete(key);
				continue;
			}
			if (held.cycleNumber !== cycle.cycleNumber || cycle.commiting) continue;
			queue.delete(key);
			try {
				await reveal(held);
				acted = true;
			} catch (error) {
				// Somebody else revealed it (the player, by hand), or it could not
				// be sent at all. Either way it is not held any more: the chain is
				// what the handover reads next.
				console.error('the local revealer could not reveal a turn', error);
			}
		}
		return acted;
	}

	const loop = createSerialisedLoop({
		pass,
		onActed: params.onActed,
		pollInterval: params.pollInterval,
	});

	return {
		scheduler: {
			async prepare() {
				return NOTHING_TO_PAY;
			},
			async submit(request) {
				const key = keyOf(request.identity, request.cycleNumber);
				queue.set(key, {
					cycleNumber: request.cycleNumber,
					transactions: request.transactions,
				});
				handled.add(key);
				void loop.tick();
			},
		},
		holds: (identity, cycleNumber) => handled.has(keyOf(identity, cycleNumber)),
		tick: loop.tick,
		start: loop.start,
		sends: () => sent,
	};
}
