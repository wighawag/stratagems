import {describe, it, expect} from 'vitest';
import {readable} from 'svelte/store';
import {
	ContractFunctionExecutionError,
	ContractFunctionRevertedError,
	ExecutionRevertedError,
	encodeErrorResult,
} from 'viem';
import {
	buildPlacementChain,
	buildPlacementCommitment,
	chunkDueNext,
	createPlacementCommitReveal,
	sendPlacementTransaction,
	NO_FURTHER_ACTIONS,
	type CommitRevealDeps,
	type Placement,
} from '$lib/placement/commit-reveal';
import {SignerOutOfFundsError} from '$lib/placement/errors';
import {onchainIdentity} from '$lib/game/identity';
import type {PlacementConfig} from '$lib/placement/config';

/**
 * The boundary, tested as a boundary.
 *
 * `send` is the ONE place in this game that sees a raw node error, and the only
 * place that turns one into {@link SignerOutOfFundsError}. Everything
 * downstream (the HUD's message, the offer of a top-up, the automatic resume
 * when gas arrives) keys off that type, so a wrong answer here is not a wrong
 * message: it offers a player a remedy that cannot work, or withholds the one
 * that can while a reveal window closes on their stake.
 *
 * Classification itself belongs to `isInsufficientFundsFailure` upstream and is
 * tested there against many node shapes. What is tested here is that this game
 * asks it, believes it, and wraps only what it says - in particular that a
 * CONTRACT REVERT does not become an out-of-gas offer, because that is the
 * failure mode a naive message match reintroduces and it is invisible from the
 * outside: the player is sent to buy gas they already have.
 */

/**
 * A signer with gas, which is the precondition for these tests being ABOUT
 * anything: `send` now refuses before it reaches the node when this reads a
 * loaded zero (see `refuseWhenTheSignerHoldsNothing`), so a fake that left it
 * out would make every case below pass for the wrong reason.
 */
const FUNDED = readable({step: 'Loaded', value: 10n ** 18n}) as never;

const doItAbi = [
	{
		type: 'function',
		name: 'doIt',
		inputs: [],
		outputs: [],
		stateMutability: 'nonpayable',
	},
] as const;

/** A `send` whose write throws `error`, with inclusion never reached. */
function sendThrowing(error: unknown) {
	const deps = {
		publicClient: {
			waitForTransactionReceipt: async () => {
				throw new Error('should not have got as far as waiting');
			},
		},
		signerBalance: FUNDED,
	} as unknown as CommitRevealDeps;
	const executor = {
		client: {
			writeContract: async () => {
				throw error;
			},
		},
	};
	return sendPlacementTransaction(deps, executor, {}, 'The commitment');
}

describe('the game move boundary', () => {
	it('names a signer that cannot pay, keeping what the node said', async () => {
		const cause = new Error(
			'insufficient funds for gas * price + value: address 0x1 have 0 want 21000',
		);

		const thrown = await sendThrowing(cause).catch((e: unknown) => e);

		expect(thrown).toBeInstanceOf(SignerOutOfFundsError);
		// The original is kept rather than replaced: the details view shows it, and
		// a summary that has thrown away the node's own words cannot be debugged.
		expect((thrown as SignerOutOfFundsError).cause).toBe(cause);
	});

	it("recognises hardhat's wording too, not just geth's", async () => {
		// The local node is the one a developer meets first, and it words this
		// differently from every hosted node. Pinned here as well as upstream
		// because it is the chain this template is actually played on.
		const thrown = await sendThrowing(
			new Error("Sender doesn't have enough funds to send tx"),
		).catch((e: unknown) => e);

		expect(thrown).toBeInstanceOf(SignerOutOfFundsError);
	});

	it('does NOT offer a top-up for a contract that reverted', async () => {
		// The expensive mistake this boundary exists to avoid. A revert reason is
		// arbitrary text a contract author chose, "insufficient funds" is among the
		// most common things it says, and no amount of gas fixes it. Offering the
		// remedy here is worse than offering nothing, because it looks like it
		// should work.
		const flattened = new Error(
			'execution reverted: ERC20: insufficient funds for transfer',
		);

		await expect(sendThrowing(flattened)).rejects.toBe(flattened);

		const structured = new ContractFunctionExecutionError(
			new ExecutionRevertedError({
				message: 'insufficient funds for this purchase',
			}),
			{abi: doItAbi, functionName: 'doIt'},
		);

		await expect(sendThrowing(structured)).rejects.toBe(structured);
	});

	it('does NOT offer a top-up for a custom error that mentions funds', async () => {
		// Worse than the above, because viem renders a custom error without the
		// word "reverted" anywhere near the reason: only the error TYPE separates
		// this from a node refusing to pay. The template's own contract raises
		// custom errors (`NotEnoughTokens`, `BondTooLow`), so this is its normal
		// failure shape and not an exotic one.
		const abi = [
			...doItAbi,
			{
				type: 'error',
				name: 'PaymentFailed',
				inputs: [{type: 'string', name: 'reason'}],
			},
		] as const;
		const reverted = new ContractFunctionRevertedError({
			abi,
			functionName: 'doIt',
			data: encodeErrorResult({
				abi,
				errorName: 'PaymentFailed',
				args: ['insufficient funds for transfer'],
			}),
		});

		await expect(sendThrowing(reverted)).rejects.toBe(reverted);
	});

	it('passes an unrelated failure through untouched', async () => {
		// The submission shows `message` for anything it cannot name, so an error
		// that arrives rewrapped would be reported as the wrong problem.
		const other = new Error('nonce too low');

		await expect(sendThrowing(other)).rejects.toBe(other);
	});

	it('throws on a reverted receipt rather than reporting success', async () => {
		// `writeContract` resolves on BROADCAST. Without this the submission would
		// call itself Committed on a commitment that never landed, and the only
		// symptom would be `NothingToReveal` a phase later. Not an out-of-gas
		// failure: the transaction was paid for and mined.
		const deps = {
			publicClient: {
				waitForTransactionReceipt: async () => ({status: 'reverted'}),
			},
			signerBalance: FUNDED,
		} as unknown as CommitRevealDeps;
		const executor = {
			client: {writeContract: async () => '0xdead' as `0x${string}`},
		};

		const thrown = await sendPlacementTransaction(
			deps,
			executor,
			{},
			'The commitment',
		).catch((e: unknown) => e);

		expect(thrown).toBeInstanceOf(Error);
		expect(thrown).not.toBeInstanceOf(SignerOutOfFundsError);
		expect((thrown as Error).message).toBe(
			'The commitment was rejected by the contract',
		);
	});

	it('returns the hash once it is included', async () => {
		const deps = {
			publicClient: {
				waitForTransactionReceipt: async () => ({status: 'success'}),
			},
			signerBalance: FUNDED,
		} as unknown as CommitRevealDeps;
		const executor = {
			client: {writeContract: async () => '0xbeef' as `0x${string}`},
		};

		await expect(
			sendPlacementTransaction(deps, executor, {}, 'The reveal'),
		).resolves.toBe('0xbeef');
	});
});

const SECRET =
	'0x0000000000000000000000000000000000000000000000000000000000000a11' as const;

const PLAYER = '0x00000000000000000000000000000000000000ff' as const;

/**
 * An adapter whose every write is captured instead of sent.
 *
 * `head` is what the fake chain reports for `getCommitment`, because a reveal
 * now READS where the turn has got to before it sends anything. A fake that
 * left that out would make the reveal throw rather than assert.
 */
function adapterRecording(options?: {
	head?: `0x${string}`;
	actionsPerReveal?: number;
	revealPhaseDuration?: number;
	gas?: {commit: bigint; reveal: bigint};
	/** Refuse every send after this many have succeeded, as a node would. */
	refuseSendAfter?: number;
	/** What `getReserve` answers, for the bond's cap. Unbounded by default. */
	reserve?: bigint;
}) {
	const sent: {
		functionName: string;
		args: readonly unknown[];
		gas?: bigint;
	}[] = [];
	// HOW OFTEN THE CLIENT LOOKS FOR A RECEIPT, recorded because it decides how
	// much of a turn can be opened before the phase shuts. See the test named
	// for it below.
	const waits: {pollingInterval?: number}[] = [];
	// A COMBINED TIMELINE. Whether every chunk is broadcast before the first
	// receipt is awaited is the whole of the pipelining, and it is invisible to
	// any assertion that looks at sends and waits separately.
	const timeline: string[] = [];
	let head = options?.head ?? ('0x' as `0x${string}`);
	const deps = {
		connection: {ensureConnected: async () => {}},
		signerExecutor: readable({
			status: 'ready',
			account: {address: '0xabc'} as unknown,
			client: {
				writeContract: async (request: {
					functionName: string;
					args: readonly unknown[];
					gas?: bigint;
				}) => {
					if (
						options?.refuseSendAfter !== undefined &&
						sent.length > options.refuseSendAfter
					) {
						throw new Error('the node refused this transaction');
					}
					sent.push(request);
					timeline.push(`send:${request.functionName}`);
					// The chain the contract keeps: a reveal rewrites the head to
					// whatever it promised next. Modelled here because a client
					// that re-read between chunks would otherwise pass this suite
					// while looping forever against a stale head.
					if (request.functionName === 'reveal') {
						head = request.args[3] as `0x${string}`;
					}
					return '0xfeed' as `0x${string}`;
				},
			},
		}) as never,
		deployments: readable({
			contracts: {Game: {address: '0xgame', abi: []}},
		}) as never,
		publicClient: {
			waitForTransactionReceipt: async (args: {pollingInterval?: number}) => {
				waits.push(args);
				timeline.push('wait');
				return {status: 'success'};
			},
			readContract: async ({functionName}: {functionName: string}) =>
				functionName === 'getReserve'
					? (options?.reserve ?? 10n ** 30n)
					: {hash: head, cycleNumber: 7n, bond: 0n},
		},
		signerBalance: FUNDED,
	} as unknown as CommitRevealDeps;

	return {
		sent,
		waits,
		timeline,
		adapter: createPlacementCommitReveal({
			deps,
			config: {
				placementCost: 10n,
				actionsPerReveal: options?.actionsPerReveal ?? 4,
				// The adapter sizes its receipt polling from the reveal phase, so a
				// config without a cycle is not one it could be built from. See
				// `game/core/reveal-window.ts`.
				cycle: {
					revealPhaseDuration: options?.revealPhaseDuration ?? 10,
				},
				gas: options?.gas ?? {commit: 150_000n, reveal: 600_000n},
			} as unknown as PlacementConfig,
		}),
	};
}

/**
 * WHAT ACTUALLY GOES ON THE WIRE, which nothing else in this repo checks.
 *
 * The contract keys every player by a `uint256` and never by an address, so
 * the identity has to be widened on its way into the call. That is
 * `onchainIdentity` in `$lib/game/identity`, and it is the client half of the
 * same one-line seam the alias is: `with/nft-identity` changes it, and every
 * site that spelled the conversion out itself would be a shared file that
 * branch has to edit.
 *
 * WHY IT IS WORTH A TEST RATHER THAN A READING. Getting it wrong is silent in
 * every direction that matters. A commitment filed under the wrong identity is
 * accepted by the contract, bonds a reserve that is not the player's (or an
 * empty one), and surfaces a cycle later as a reveal that cannot find it -
 * by which time the bond is spent. Neither `check` nor any other suite here
 * looks at an argument list: the ABI types it as `uint256` and an address
 * widens to one perfectly happily.
 */
describe('the identity that reaches the contract', () => {
	it('commits under the identity, widened the way the contract keys it', async () => {
		const {sent, adapter} = adapterRecording();

		await adapter.commit({
			identity: PLAYER,
			hash: '0xhash' as `0x${string}`,
			actions: [{cellID: 1n}, {cellID: 2n}],
			secret: '0xsecret' as `0x${string}`,
			cycleNumber: 3,
			revealDueAt: 0,
		});

		expect(sent[0].functionName).toBe('makeCommitment');
		// The identity, and NOT the address it happens to be spelled as here.
		expect(sent[0].args[0]).toBe(onchainIdentity(PLAYER));
		expect(typeof sent[0].args[0]).toBe('bigint');
		// A WHOLE CHUNK, not the exact cost: two placements at four per reveal
		// bond four placements' worth, so the bond does not say how many there
		// are. Bonding less than the cost makes the reveal revert once the
		// commitment is immovable; the surplus comes back with the last reveal.
		expect(sent[0].args[2]).toBe(40n);
	});

	it('bonds no more than the reserve holds, and never less than the cost', async () => {
		const covered = adapterRecording({reserve: 25n});
		await covered.adapter.commit({
			identity: PLAYER,
			hash: '0xhash' as `0x${string}`,
			actions: [{cellID: 1n}, {cellID: 2n}],
			secret: '0xsecret' as `0x${string}`,
			cycleNumber: 3,
			revealDueAt: 0,
		});
		expect(covered.sent[0].args[2]).toBe(25n);
	});

	it('reveals against the same identity it committed under', async () => {
		// Two calls a cycle apart, and a mismatch between them costs the stake
		// rather than failing loudly: the reveal simply finds no commitment.
		const actions = [{cellID: 1n}];
		const secret = SECRET;
		const {hash} = buildPlacementCommitment({
			actions,
			secret,
			actionsPerReveal: 4,
		});
		const {sent, adapter} = adapterRecording({head: hash});

		await adapter.commit({
			identity: PLAYER,
			hash,
			actions,
			secret,
			cycleNumber: 3,
			revealDueAt: 0,
		});
		await adapter.reveal({identity: PLAYER, actions, secret});

		expect(sent[1].functionName).toBe('reveal');
		expect(sent[1].args[0]).toBe(sent[0].args[0]);
	});
});

/**
 * A TURN BIGGER THAN A TRANSACTION.
 *
 * Every chain has a gas ceiling, so a turn longer than it is committed as the
 * head of a HASH CHAIN and opened one piece at a time. What this suite is about
 * is the half of that the contract cannot check for you: the client has to cut
 * the turn into exactly the pieces the deployment will accept, hash them in the
 * right direction, send them in the right order, and know where to pick up when
 * it is interrupted.
 *
 * EVERY FAILURE HERE IS SILENT AND EXPENSIVE. A chain built at the wrong chunk
 * size hashes to a head the contract cannot follow, and nothing says so until
 * the reveal reverts with the stake already bonded.
 */
describe('the hash chain a turn is committed as', () => {
	const row = (count: number): Placement[] =>
		Array.from({length: count}, (_, i) => ({cellID: BigInt(i)}));

	it('cuts a turn into full chunks with a short one at the end', () => {
		const chain = buildPlacementChain({
			actions: row(6),
			secret: SECRET,
			actionsPerReveal: 4,
		});

		expect(chain.length).toBe(2);
		expect(chain[0].actions.length).toBe(4);
		expect(chain[1].actions.length).toBe(2);
		// EXACTLY FULL EXCEPT THE LAST is the contract's rule, not a preference:
		// a chunk that promises a successor and is not full is refused, so a
		// client that balanced the pieces (3 and 3) would build a chain no reveal
		// past the first could follow.
		expect(chain[0].furtherActions).toBe(chain[1].hash);
		expect(chain[1].furtherActions).toBe(NO_FURTHER_ACTIONS);
	});

	it('commits the HEAD, which is the first chunk and not the whole turn', () => {
		const actions = row(6);
		const chain = buildPlacementChain({
			actions,
			secret: SECRET,
			actionsPerReveal: 4,
		});

		expect(
			buildPlacementCommitment({actions, secret: SECRET, actionsPerReveal: 4})
				.hash,
		).toBe(chain[0].hash);
	});

	it('hashes a DIFFERENT head at a different chunk size', () => {
		// THE REASON THE CHUNK SIZE IS READ OFF THE DEPLOYMENT. A client carrying
		// its own number commits a head the contract cannot follow, and the only
		// symptom is a reveal that reverts after the bond is immovable. This is
		// the client half of the contract test that deploys a game at a different
		// chunk size and watches the rule follow.
		const actions = row(6);
		const atFour = buildPlacementCommitment({
			actions,
			secret: SECRET,
			actionsPerReveal: 4,
		});
		const atFive = buildPlacementCommitment({
			actions,
			secret: SECRET,
			actionsPerReveal: 5,
		});

		expect(atFour.hash).not.toBe(atFive.hash);
	});

	it('gives an empty turn one chunk, so it has a head at all', () => {
		// An idle player's automatic turn in a game that punishes silence. It is
		// committed, revealed, and resolves to nothing.
		const chain = buildPlacementChain({
			actions: [],
			secret: SECRET,
			actionsPerReveal: 4,
		});

		expect(chain.length).toBe(1);
		expect(chain[0].actions).toEqual([]);
		expect(chain[0].furtherActions).toBe(NO_FURTHER_ACTIONS);
	});

	it('refuses a chunk size no turn could ever be opened at', () => {
		expect(() =>
			buildPlacementChain({
				actions: row(2),
				secret: SECRET,
				actionsPerReveal: 0,
			}),
		).toThrow(/not a turn anybody could open/);
	});

	it('finds where the chain has got to from the head on chain', () => {
		const chain = buildPlacementChain({
			actions: row(9),
			secret: SECRET,
			actionsPerReveal: 4,
		});

		expect(chunkDueNext(chain, chain[0].hash)).toBe(0);
		expect(chunkDueNext(chain, chain[1].hash)).toBe(1);
		expect(chunkDueNext(chain, chain[2].hash)).toBe(2);
		// Hex case is a difference nothing would report as an error, and the
		// refusal it would produce reads to a player as "I misremembered my own
		// turn".
		expect(
			chunkDueNext(chain, chain[1].hash.toUpperCase() as `0x${string}`),
		).toBe(1);
		// A head belonging to no chunk of this turn is not a retry: the contract
		// is holding somebody else's commitment.
		expect(chunkDueNext(chain, NO_FURTHER_ACTIONS)).toBe(undefined);
	});
});

describe('revealing a turn bigger than a transaction', () => {
	const row = (count: number): Placement[] =>
		Array.from({length: count}, (_, i) => ({cellID: BigInt(i)}));

	it('sends one transaction per chunk, in order, each promising the next', async () => {
		const actions = row(6);
		const chain = buildPlacementChain({
			actions,
			secret: SECRET,
			actionsPerReveal: 4,
		});
		const {sent, adapter} = adapterRecording({head: chain[0].hash});

		const progress: {done: number; total: number}[] = [];
		await adapter.reveal({
			identity: PLAYER,
			actions,
			secret: SECRET,
			onProgress: (p) => progress.push(p),
		});

		expect(sent.length).toBe(2);
		expect(sent.map((s) => s.functionName)).toEqual(['reveal', 'reveal']);
		// The actions go out in order, cut the way the chain was built.
		expect(sent[0].args[1]).toEqual(actions.slice(0, 4));
		expect(sent[1].args[1]).toEqual(actions.slice(4));
		// And each says what comes after it, which is what the contract checks
		// the NEXT one against.
		expect(sent[0].args[3]).toBe(chain[1].hash);
		expect(sent[1].args[3]).toBe(NO_FURTHER_ACTIONS);

		expect(progress).toEqual([
			{done: 0, total: 2},
			{done: 1, total: 2},
			{done: 2, total: 2},
		]);
	});

	it('resumes from the chain head rather than from anything remembered', async () => {
		// THE CASE THAT COSTS A STAKE IF IT IS GOT WRONG. A reveal interrupted
		// halfway - a reload, a signer that ran out of gas between chunks, a
		// second device that sent the first piece - leaves this browser with no
		// memory of how far it got. Starting again re-sends a chunk the head has
		// already moved past, which the contract refuses, so the rest of the turn
		// never goes out and the remaining bond is forfeited.
		const actions = row(9);
		const chain = buildPlacementChain({
			actions,
			secret: SECRET,
			actionsPerReveal: 4,
		});
		// The chain says two chunks have landed already.
		const {sent, adapter} = adapterRecording({head: chain[2].hash});

		const progress: {done: number; total: number}[] = [];
		await adapter.reveal({
			identity: PLAYER,
			actions,
			secret: SECRET,
			onProgress: (p) => progress.push(p),
		});

		expect(sent.length).toBe(1);
		expect(sent[0].args[1]).toEqual(actions.slice(8));
		// The count the player is shown starts where the chain actually is, not
		// at zero: a reveal that said "1 of 3" here would be describing work that
		// had already been paid for.
		expect(progress[0]).toEqual({done: 2, total: 3});
	});

	it('refuses to send against a commitment that is not this turn', async () => {
		const actions = row(6);
		const {sent, adapter} = adapterRecording({
			head: `0x${'ab'.repeat(24)}` as `0x${string}`,
		});

		await expect(
			adapter.reveal({identity: PLAYER, actions, secret: SECRET}),
		).rejects.toThrow(/not the turn this browser is holding/);
		expect(sent.length, 'nothing should have gone on the wire').toBe(0);
	});

	it('says so rather than sending when there is no commitment at all', async () => {
		const {sent, adapter} = adapterRecording();
		void adapter;

		// `cycleNumber: 0n` is the contract's way of saying the slot is free, and
		// the fake reports 7n, so this case is reached by emptying it.
		const empty = createPlacementCommitReveal({
			deps: {
				connection: {ensureConnected: async () => {}},
				signerExecutor: readable({
					status: 'ready',
					account: {address: '0xabc'} as unknown,
					client: {writeContract: async () => '0xfeed' as `0x${string}`},
				}) as never,
				deployments: readable({
					contracts: {Game: {address: '0xgame', abi: []}},
				}) as never,
				publicClient: {
					readContract: async () => ({
						hash: NO_FURTHER_ACTIONS,
						cycleNumber: 0n,
						bond: 0n,
					}),
					waitForTransactionReceipt: async () => ({status: 'success'}),
				},
				signerBalance: FUNDED,
			} as unknown as CommitRevealDeps,
			config: {
				placementCost: 10n,
				actionsPerReveal: 4,
				cycle: {revealPhaseDuration: 10},
				gas: {commit: 150_000n, reveal: 600_000n},
			} as unknown as PlacementConfig,
		});

		await expect(
			empty.reveal({identity: PLAYER, actions: row(2), secret: SECRET}),
		).rejects.toThrow(/no commitment on chain/);
		expect(sent.length).toBe(0);
	});
});

describe('a signer with nothing in it never reaches the node', () => {
	/**
	 * WHY THIS REFUSAL EXISTS AT ALL, since "let the node say no" is the simpler
	 * design and is what this file used to do.
	 *
	 * On the local node this game develops and tests against, a transaction the
	 * node REJECTS for want of gas still advances that account's pending nonce,
	 * and nothing puts it back (`hardhat_setNonce` will not lower it). The signer
	 * is then wedged for good: every later move is built at a nonce the chain
	 * will never reach, gets a hash, and is never mined.
	 *
	 * The cost lands on the remedy rather than the fault. The player tops up, the
	 * submission retries, and the retry hangs in `Committing` forever, so a stake
	 * that was recoverable is lost. That is precisely what `out-of-gas.e2e.ts`
	 * exists to prevent, and it was reaching it through the fix instead of the
	 * failure.
	 */
	function sendWithBalance(balance: {step: string; value?: bigint}) {
		let reachedTheNode = false;
		const deps = {
			publicClient: {
				waitForTransactionReceipt: async () => ({status: 'success'}),
			},
			signerBalance: readable(balance) as never,
		} as unknown as CommitRevealDeps;
		const executor = {
			client: {
				writeContract: async () => {
					reachedTheNode = true;
					return '0xhash' as `0x${string}`;
				},
			},
		};
		return {
			run: () => sendPlacementTransaction(deps, executor, {}, 'The commitment'),
			reachedTheNode: () => reachedTheNode,
		};
	}

	it('refuses, and says the thing the player can act on', async () => {
		const {run, reachedTheNode} = sendWithBalance({step: 'Loaded', value: 0n});
		await expect(run()).rejects.toBeInstanceOf(SignerOutOfFundsError);
		// The whole point: nothing was sent, so no nonce was burned.
		expect(reachedTheNode(), 'a doomed move must not reach the node').toBe(
			false,
		);
	});

	it('sends when the signer has gas', async () => {
		const {run, reachedTheNode} = sendWithBalance({step: 'Loaded', value: 1n});
		await expect(run()).resolves.toBe('0xhash');
		expect(reachedTheNode()).toBe(true);
	});

	it('does NOT refuse on a balance it has not read yet', async () => {
		// The guard asserts about what the app already SHOWS the player, so an
		// unloaded store falls through to the behaviour that shipped before it.
		// Refusing here would block a funded signer's move on a slow first poll,
		// which is a worse failure than the one being prevented and would look
		// exactly like the app being broken at startup.
		const {run, reachedTheNode} = sendWithBalance({step: 'Unloaded'});
		await expect(run()).resolves.toBe('0xhash');
		expect(reachedTheNode()).toBe(true);
	});
});

describe('how long the client waits before looking for a receipt', () => {
	const row = (count: number): Placement[] =>
		Array.from({length: count}, (_, i) => ({cellID: BigInt(i)}));

	/**
	 * THIS IS HALF OF WHAT A LONG TURN COSTS, and it was invisible until it was
	 * measured.
	 *
	 * A chained reveal sends one chunk, waits for the receipt, then signs the
	 * next, so the cost of one chunk is `max(block time, poll interval)`. viem's
	 * default poll is four seconds. Measured against a local node mining on a
	 * one-second interval with a ten-second reveal phase: at the default, three
	 * chunks land before the window shuts; at a poll sized from the phase, nine
	 * do. A turn whose chunks do not all land is a missed reveal, which forfeits
	 * the stake - so this is not a latency nicety.
	 *
	 * Pinned here because the change is one argument that nothing else would
	 * notice: removing it leaves every other test in this file green.
	 */
	it('sizes the wait from the reveal phase rather than taking viem default', async () => {
		const {adapter, waits} = adapterRecording({revealPhaseDuration: 10});
		await adapter.commit({
			identity: PLAYER,
			hash: '0xhash' as `0x${string}`,
			actions: row(1),
			secret: SECRET,
			cycleNumber: 3,
			revealDueAt: 0,
		});

		expect(waits.length).toBeGreaterThan(0);
		// A twentieth of a ten-second phase.
		expect(waits[0].pollingInterval).toBe(500);
	});

	it('leaves a long cycle alone, where four seconds is already small', async () => {
		const {adapter, waits} = adapterRecording({revealPhaseDuration: 3_600});
		await adapter.commit({
			identity: PLAYER,
			hash: '0xhash' as `0x${string}`,
			actions: row(1),
			secret: SECRET,
			cycleNumber: 3,
			revealDueAt: 0,
		});

		// viem's own default. Two of the games in this lineage run a 23h/1h
		// split, and they must not start polling harder because this arrived.
		expect(waits[0].pollingInterval).toBe(4_000);
	});

	it('waits the same way for every chunk of a turn, not just the first', async () => {
		const actions = row(9);
		const chain = buildPlacementChain({
			actions,
			secret: SECRET,
			actionsPerReveal: 4,
		});
		const {adapter, waits} = adapterRecording({
			revealPhaseDuration: 10,
			head: chain[0].hash,
		});
		await adapter.reveal({
			identity: PLAYER,
			actions,
			secret: SECRET,
		});

		// Three chunks at four per reveal, and the window closes on all of them
		// together: a poll that was only applied to the first would leave the
		// rest costing four seconds each.
		expect(waits.length).toBe(3);
		for (const wait of waits) expect(wait.pollingInterval).toBe(500);
	});
});

describe('the gas limit every move carries', () => {
	const row = (count: number): Placement[] =>
		Array.from({length: count}, (_, i) => ({cellID: BigInt(i)}));

	/**
	 * THE FIGURE IS A CEILING, AND IT COMES OFF THE DEPLOYMENT.
	 *
	 * Passing it rather than estimating is what makes the cost of a move a
	 * number the player can be told in advance, and it removes an
	 * `eth_estimateGas` round trip from every chunk of a reveal. The danger is
	 * the other direction: a limit below what the transaction needs is an
	 * out-of-gas reveal, which is a MISSED reveal and forfeits the stake. That
	 * is guarded in the contracts suite (`GasBudget.test.ts` fails when the
	 * worst case comes within 10% of the declared figure); what is guarded here
	 * is that the declared figure is the one actually used, rather than a
	 * constant or nothing at all.
	 */
	it('commits with the limit the deployment declared', async () => {
		const {adapter, sent} = adapterRecording();
		await adapter.commit({
			identity: PLAYER,
			hash: '0xhash' as `0x${string}`,
			actions: row(1),
			secret: SECRET,
			cycleNumber: 3,
			revealDueAt: 0,
		});
		expect(sent[0].gas).toBe(150_000n);
	});

	it('reveals every chunk with it, not just the first', async () => {
		const actions = row(9);
		const chain = buildPlacementChain({
			actions,
			secret: SECRET,
			actionsPerReveal: 4,
		});
		const {adapter, sent} = adapterRecording({head: chain[0].hash});
		await adapter.reveal({identity: PLAYER, actions, secret: SECRET});

		// Three chunks. A limit applied only to the first would leave the rest
		// estimating, which is the round trip this removes - and on a chain where
		// the estimate reverts (chunk 2 is checked against a head chunk 1 has not
		// written yet) it would not merely be slower.
		expect(sent.length).toBe(3);
		for (const request of sent) expect(request.gas).toBe(600_000n);
	});

	it('takes the figures from the config rather than hardcoding them', async () => {
		const {adapter, sent} = adapterRecording({
			gas: {commit: 111_000n, reveal: 222_000n},
		});
		await adapter.commit({
			identity: PLAYER,
			hash: '0xhash' as `0x${string}`,
			actions: row(1),
			secret: SECRET,
			cycleNumber: 3,
			revealDueAt: 0,
		});
		// A different deployment declares different numbers, and the client
		// follows without a code change. That is the whole point of the figures
		// living on the deployment: contracts are not inherited in this tree.
		expect(sent[0].gas).toBe(111_000n);
	});
});

describe('a chained reveal is pipelined, not one round trip per chunk', () => {
	const row = (count: number): Placement[] =>
		Array.from({length: count}, (_, i) => ({cellID: BigInt(i)}));

	/**
	 * THE CHANGE THAT MAKES A LONG TURN OPENABLE AT ALL.
	 *
	 * Waiting for each receipt before broadcasting the next costs
	 * `max(block time, poll interval)` per chunk, so a ten-second reveal phase
	 * held three chunks - twelve actions - and anything longer could not be
	 * revealed in time, which is a missed reveal and forfeits the stake.
	 * Measured on a 1s chain at 13 chunks: 10,282ms with 9 landing, against
	 * 1,199ms with all 13 in one block.
	 *
	 * It is safe because nonces are per account and strictly ordered, so the
	 * chunks execute in the order they were sent however they arrive - which is
	 * what the contract's hash chain requires, since chunk `i + 1` is checked
	 * against a head chunk `i` writes.
	 */
	it('broadcasts every chunk before waiting for any of them', async () => {
		const actions = row(9);
		const chain = buildPlacementChain({
			actions,
			secret: SECRET,
			actionsPerReveal: 4,
		});
		const {adapter, timeline} = adapterRecording({head: chain[0].hash});
		await adapter.reveal({identity: PLAYER, actions, secret: SECRET});

		// Three sends, THEN three waits. One send per wait, interleaved, is the
		// shape this replaced.
		expect(timeline).toEqual([
			'send:reveal',
			'send:reveal',
			'send:reveal',
			'wait',
			'wait',
			'wait',
		]);
	});

	it('still reports progress by LANDINGS, never by sends', async () => {
		const actions = row(9);
		const chain = buildPlacementChain({
			actions,
			secret: SECRET,
			actionsPerReveal: 4,
		});
		const {adapter} = adapterRecording({head: chain[0].hash});

		const progress: {done: number; total: number}[] = [];
		await adapter.reveal({
			identity: PLAYER,
			actions,
			secret: SECRET,
			onProgress: (p) => progress.push(p),
		});

		// A broadcast chunk has not been APPLIED. Counting sends would tell a
		// player their turn was safe while it was still in a mempool, and the
		// whole point of the progress figure is that it is about money.
		expect(progress).toEqual([
			{done: 0, total: 3},
			{done: 1, total: 3},
			{done: 2, total: 3},
			{done: 3, total: 3},
		]);
	});

	it('stops broadcasting when a send is refused, so no nonce is stranded', async () => {
		const actions = row(9);
		const chain = buildPlacementChain({
			actions,
			secret: SECRET,
			actionsPerReveal: 4,
		});
		const {adapter, sent} = adapterRecording({
			head: chain[0].hash,
			refuseSendAfter: 1,
		});

		await expect(
			adapter.reveal({identity: PLAYER, actions, secret: SECRET}),
		).rejects.toThrow();

		// ONE send got out, the refusal stopped the rest. This is the difference
		// between pipelining and signing all `k` up front: on the node this game
		// develops against a rejected send burns a nonce permanently, so a chunk
		// built at a nonce the chain will never reach strands the whole turn
		// rather than one transaction.
		expect(sent.length).toBe(2);
	});
});
