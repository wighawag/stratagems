import {keccak256, encodePacked} from 'viem';
import type {DeploymentsStore} from '$lib/deployments-store';
import type {EIP1193ProviderLike} from '$lib/embedded';
import {
	createPlayedKeys,
	createSerialisedLoop,
	type SerialisedLoop,
} from '$lib/game/core/played';
import {playedSeatSecret} from '$lib/game/core/secret';
import {createCycleReader} from '$lib/placement/cycle';
import {cellID} from '$lib/placement/cells';
import {
	bondFor,
	costOfPlacements,
	type PlacementConfig,
} from '$lib/placement/config';
import {
	buildPlacementChain,
	chunkDueNext,
	type Placement,
} from '$lib/placement/commit-reveal';

/**
 * THE OTHER PLAYERS IN THE OFFLINE WORLD, because a commit-reveal game with one
 * player is not one.
 *
 * WHY THERE HAS TO BE MORE THAN ONE AT ALL. A cycle with a single waited-for
 * member hides nothing: unanimity is satisfied by the only person present, and
 * two of the three conditions `advanceCycle` exists to enforce
 * (`StillWaitingToCommit`, `StillWaitingToReveal`) can never be reached. THREE
 * rather than two, because two is a duel: "everyone" and "the other one" are
 * the same statement, and a board where two players contest one cell is a
 * special case of the rule rather than an instance of it. At three, the
 * accumulation in `_place` has something to accumulate and the
 * order-independence property has something to say.
 *
 * WHY THE WORLD PLAYS THEM. Under the manual cycle policy nothing moves until
 * every waited-for member has acted, so two members who never act do not make
 * a quiet game - they make a FROZEN one, for the human as well. Either the
 * world plays them or it must not enrol them.
 *
 * WHAT THIS IS NOT. It is not a mode, and it is not the NPCs a later phase
 * wants: there is no intelligence here, no difficulty and no interface for
 * either. It is the smallest thing that makes the cycle have somebody to wait
 * for, written in the app beside the world that wants it, exactly as the
 * provisioning hook is.
 *
 * WHAT IS NO LONGER HERE IS THE MACHINERY, and that split is worth knowing
 * before reading on. The keyring that sends a call and waits for inclusion, the
 * loop that serialises passes and queues a poke that arrives during one, and the
 * subscription that pokes when the human acts are `$lib/game/core/played`'s,
 * because two games wrote them identically. The secret is
 * `$lib/game/core/secret`'s for the same reason. What is LEFT here is the three
 * things those two games disagreed about, and they are the reason there is no
 * shared `createPlayedSeats`: how a turn is derived, whether a reveal is one
 * call or a chain of chunks, and what settling a missed reveal COSTS - which
 * here spends this world's own stake and in the next game spends nothing at all.
 *
 * THEY HOLD NOTHING IN MEMORY, AND THAT IS THE LOAD-BEARING PROPERTY. Both the
 * secret and the actions are DERIVED from (chain, game, identity, cycle), so a
 * reload reconstructs them exactly. The alternative bricks the world: a player
 * that commits and then forgets its secret can never reveal, `advanceCycle`
 * refuses to close a cycle with an unopened commitment in it (correctly - that
 * is what stops a turn being stranded), and the human's game stops for good
 * with their stake inside it. This is D9's argument about a player's own
 * secret, arriving one level down and for the same reason.
 *
 * AND BECAUSE IT IS DERIVED, THE DERIVATION IS A WIRE. A build that changes
 * {@link turnFor} or `playedSeatSecret` can no longer open a commitment an
 * earlier build left on chain, which under the manual policy is not a lost turn
 * but a frozen world: no advance can close a cycle holding an unopened
 * commitment, and neither settlement touches a commitment from the CURRENT
 * cycle. {@link createOfflinePlayers} closes that hole from the only
 * side it can be closed from - it re-commits, in the commit phase, whenever the
 * head on chain is not one this build can open - so by the time a reveal phase
 * opens every played commitment is openable. The same care AGENTS.md asks for
 * around a persisted storage key applies here, one level over.
 *
 * NOTHING HERE KNOWS HOW THIS GAME SPELLS AN IDENTITY, which is what keeps the
 * template's branches from diverging over it. A player arrives as a key and an
 * identity already spelled the way the CONTRACT spells it, so the one thing
 * that differs between branches (an address widened, against a token id) stays
 * in `$lib/offline`, which differs there already.
 */

/** One player the world plays: a key it holds, and who that key plays as. */
export type OfflinePlayer = {
	privateKey: `0x${string}`;
	/**
	 * The identity as the CONTRACT spells it, which is the one thing about a
	 * player that differs between branches of this template. The caller widens
	 * an address or passes a token id; nothing in this file has an opinion.
	 */
	identity: bigint;
};

/** What `getCommitment` hands back. */
type Commitment = {hash: `0x${string}`; cycleNumber: bigint; bond: bigint};

/** `payee` on a commit or a reveal: nobody is being paid. */
const NO_PAYEE = '0x0000000000000000000000000000000000000000' as const;

/**
 * How far from the origin a played turn may land, in cells, on each axis.
 *
 * Kept SMALL so the human can see what the others did without panning, which is
 * the only reason a played turn is a board position rather than a number. The
 * camera opens on 24x24 cells (`placement/config.ts`), so a 13x13 block around
 * the origin is always on screen.
 */
const PLAYED_TURN_SPREAD = 13;

/**
 * WHERE A PLAYED TURN COMES FROM, deterministically.
 *
 * The cell is a pure function of the player and the cycle, for the reason in
 * the file comment: a reload has to reproduce the same turn or the commitment
 * it already made can never be opened. Randomness here would be a world that
 * bricks itself on refresh.
 *
 * ONE PLACEMENT, which is the smallest turn that is not the empty one. A player
 * whose turn is empty commits, reveals and changes nothing, so it would satisfy
 * unanimity without ever putting anything on the board - and the board is where
 * the human can see that somebody else is playing.
 */
export function turnFor(params: {
	game: `0x${string}`;
	identity: bigint;
	cycleNumber: number;
}): Placement[] {
	const seed = BigInt(
		keccak256(
			encodePacked(
				['string', 'address', 'uint256', 'uint64'],
				[
					'Offline:turn',
					params.game,
					params.identity,
					BigInt(params.cycleNumber),
				],
			),
		),
	);
	const half = Math.floor(PLAYED_TURN_SPREAD / 2);
	const x = Number(seed % BigInt(PLAYED_TURN_SPREAD)) - half;
	const y = Number((seed >> 32n) % BigInt(PLAYED_TURN_SPREAD)) - half;
	return [{cellID: cellID(x, y)}];
}

export function createOfflinePlayers(params: {
	provider: EIP1193ProviderLike;
	deployments: DeploymentsStore;
	config: PlacementConfig;
	players: readonly OfflinePlayer[];
	/** How often to look. The framework's loop owns the default. */
	pollInterval?: number;
	/**
	 * Called after a pass in which a player actually SENT something.
	 *
	 * Passed straight through to the loop, which is where the argument for it
	 * lives: a played commit is exactly the moment unanimity may have been
	 * completed, and the browser's advance client only finds out on its own
	 * one-second poll.
	 */
	onActed?: () => void;
}): SerialisedLoop {
	const {provider, deployments, config, players} = params;

	const records = deployments.get();
	const game = {
		address: records.contracts.Game.address,
		abi: records.contracts.Game.abi,
	};
	// Built rather than cast out of the records: what viem needs of a chain is
	// an id, a name and a currency, and the records' type is the build-time
	// literal one, so a cast here would be a cast to something this world is
	// not.
	const chain = {
		id: records.chain.id,
		name: records.chain.name,
		nativeCurrency: records.chain.nativeCurrency,
		rpcUrls: {default: {http: [] as string[]}},
	};

	// THE KEYRING AND THE WAITING ARE THE FRAMEWORK'S, and what is left here is
	// which calls to make. `publicClient` comes back out of it so that the reads
	// below go through the same client the sends wait on, rather than a second one
	// against the same provider.
	const keys = createPlayedKeys({provider, chain, contract: game});
	const publicClient = keys.publicClient;

	// THE SEAM SITTING BESIDE THIS FILE, rather than a fourth copy of the same
	// read. This is the one line where the two offline worlds in this tree
	// differed - `getCycle` against reveal-or-die's `getCycleNumber` - and both
	// of them already ship a reader that answers it in the framework's own shape
	// for the trackers. The played players were duplicating it instead of asking.
	const readCycle = createCycleReader({publicClient, deployments: records});

	function send(
		player: OfflinePlayer,
		request: Record<string, unknown>,
	): Promise<void> {
		return keys.send(player.privateKey, request);
	}

	async function commitmentOf(player: OfflinePlayer): Promise<Commitment> {
		return (await publicClient.readContract({
			...game,
			functionName: 'getCommitment',
			args: [player.identity],
		})) as Commitment;
	}

	async function reserveOf(player: OfflinePlayer): Promise<bigint> {
		return (await publicClient.readContract({
			...game,
			functionName: 'getReserve',
			args: [player.identity],
		})) as bigint;
	}

	/**
	 * Every turn this file could have committed for a player in a cycle.
	 *
	 * TWO, AND THE SECOND ONE IS THE POINT. A played player commits an EMPTY
	 * turn when it cannot afford the bond (see {@link turnToCommit}), so what is
	 * on chain depends on what the reserve held at COMMIT time - which is not
	 * something a reveal may re-derive, because a reveal that guessed wrong
	 * would build a chain whose head is not the one the contract is holding and
	 * would strand the commitment. So the reveal matches the head against both
	 * and lets the hash decide, exactly as the app's own adapter lets the hash
	 * judge a recovered turn.
	 */
	function candidateTurns(
		player: OfflinePlayer,
		cycleNumber: number,
	): Placement[][] {
		return [
			turnFor({game: game.address, identity: player.identity, cycleNumber}),
			[],
		];
	}

	/**
	 * What this player will commit to this cycle.
	 *
	 * AN EMPTY TURN WHEN THEY CANNOT AFFORD ONE, which is the answer to "what
	 * happens when a played player runs out of stake" and is better than the
	 * obvious alternative. Topping them back up would be the same hazard as
	 * refilling the human's stake on reload, one player over; refusing to commit
	 * would freeze the cycle for everybody, since unanimity waits for them. An
	 * empty turn costs nothing, bonds nothing, resolves to nothing, and keeps
	 * the game moving - which is exactly what an idle player in a game that
	 * punishes silence already does (see `cutIntoChunks` on why an empty turn is
	 * still one chunk with a head to commit).
	 *
	 * On a branch where a placement is free the bond is always zero, so the
	 * reserve is never read and this branch is never taken.
	 */
	async function turnToCommit(
		player: OfflinePlayer,
		cycleNumber: number,
	): Promise<{actions: Placement[]; bond: bigint}> {
		const [wanted] = candidateTurns(player, cycleNumber);
		const cost = costOfPlacements(config, wanted.length);
		if (cost === 0n) return {actions: wanted, bond: 0n};
		const reserve = await reserveOf(player);
		// Whole chunks, like the app's own client (see `bondFor`): the surplus
		// comes back with the last reveal or a settlement shown the chunks.
		if (reserve >= cost) {
			return {actions: wanted, bond: bondFor(config, wanted.length, reserve)};
		}
		return {actions: [], bond: 0n};
	}

	async function commit(
		player: OfflinePlayer,
		cycleNumber: number,
		onChain: Commitment,
	): Promise<void> {
		const secret = playedSeatSecret({
			chainId: records.chain.id,
			contract: game.address,
			identity: player.identity,
			cycleNumber,
		});
		const {actions, bond} = await turnToCommit(player, cycleNumber);
		const chain = buildPlacementChain({
			actions,
			secret,
			actionsPerReveal: config.actionsPerReveal,
		});

		// ALREADY DONE, OR DONE WRONG, and the second case is why this compares
		// the head rather than the cycle number. A commitment this build cannot
		// open would freeze the world the moment the reveal phase opened (no
		// advance can close a cycle holding one, and the contract refuses to
		// settle a commitment from the CURRENT cycle), and the commit phase is
		// the only phase in which anything can still be done about it. Replacing
		// a commitment made in the same cycle is expressly allowed and is counted
		// once, so this costs nothing when it never fires.
		if (Number(onChain.cycleNumber) === cycleNumber) {
			if (onChain.hash.toLowerCase() === chain[0].hash.toLowerCase()) return;
		}

		await send(player, {
			functionName: 'makeCommitment',
			args: [player.identity, chain[0].hash, bond, NO_PAYEE],
			gas: config.gas.commit,
		});
	}

	async function reveal(
		player: OfflinePlayer,
		cycleNumber: number,
		onChain: Commitment,
	): Promise<void> {
		// Nothing committed in this cycle means nothing owed: this player entered
		// after the commit phase closed, or has already been settled.
		if (Number(onChain.cycleNumber) !== cycleNumber) return;

		const secret = playedSeatSecret({
			chainId: records.chain.id,
			contract: game.address,
			identity: player.identity,
			cycleNumber,
		});

		// WHICH CHUNK IS DUE IS READ OFF THE CHAIN, not remembered, for the same
		// reason the app's adapter does it: a reveal interrupted half way is
		// resumed by asking where the head got to. These turns are one chunk
		// today and the loop is written so that stops being load-bearing.
		for (const actions of candidateTurns(player, cycleNumber)) {
			const chain = buildPlacementChain({
				actions,
				secret,
				actionsPerReveal: config.actionsPerReveal,
			});
			const from = chunkDueNext(chain, onChain.hash);
			if (from === undefined) continue;
			for (let i = from; i < chain.length; i++) {
				await send(player, {
					functionName: 'reveal',
					args: [
						player.identity,
						chain[i].actions as {cellID: bigint}[],
						secret,
						chain[i].furtherActions,
						NO_PAYEE,
					],
					gas: config.gas.reveal,
				});
			}
			return;
		}

		// THE ONE STATE THIS FILE CANNOT GET OUT OF, said out loud rather than
		// papered over. The chain is holding a turn no candidate reproduces, so
		// it cannot be opened; it cannot be settled either, because a
		// settlement refuses a commitment from the current cycle;
		// and the cycle cannot advance past it. It takes a build that changed
		// `turnFor` or `secretFor` between a commit and its reveal to reach, and
		// the commit path above is what stops that happening in the ordinary
		// case. Starting a new world is the remedy, which is what clearing the
		// remembered chain id does.
		console.warn(
			'an offline player is holding a commitment this build cannot open, so the cycle cannot close',
			{identity: player.identity, cycleNumber},
		);
	}

	/**
	 * Settle a commitment from a past cycle, WITH ITS CHUNKS when this file can
	 * rebuild the turn, which forfeits only what the placements would have cost
	 * and gives the rest of the bond back. The derivation that let the reveal
	 * be rebuilt lets the settlement be too: the secret is a function of the
	 * seat and the cycle, and the candidates are the turns it could have
	 * committed. Only a head no candidate reproduces falls back to forfeiting
	 * the whole bond, which the seat may do because it sends as the player.
	 */
	async function settle(
		player: OfflinePlayer,
		onChain: Commitment,
	): Promise<void> {
		const cycleNumber = Number(onChain.cycleNumber);
		const secret = playedSeatSecret({
			chainId: records.chain.id,
			contract: game.address,
			identity: player.identity,
			cycleNumber,
		});
		for (const actions of candidateTurns(player, cycleNumber)) {
			const chain = buildPlacementChain({
				actions,
				secret,
				actionsPerReveal: config.actionsPerReveal,
			});
			const from = chunkDueNext(chain, onChain.hash);
			if (from === undefined) continue;
			for (let i = from; i < chain.length; i++) {
				await send(player, {
					functionName: 'acknowledgeMissedReveal',
					args: [
						player.identity,
						chain[i].actions as {cellID: bigint}[],
						secret,
						chain[i].furtherActions,
					],
					gas: config.gas.reveal,
				});
			}
			return;
		}
		await send(player, {
			functionName: 'forfeitMissedReveal',
			args: [player.identity],
		});
	}

	async function act(
		player: OfflinePlayer,
		cycle: {cycleNumber: number; commiting: boolean},
	): Promise<void> {
		const onChain = await commitmentOf(player);

		// A COMMITMENT FROM A PAST CYCLE IS SETTLED RATHER THAN CARRIED, and this
		// is the safety valve the whole world depends on. However it happened -
		// the tab closed between a commit and its reveal, a send that never
		// landed - the contract refuses every later `makeCommitment` until it is
		// acknowledged, and `advanceCycle` refuses to close a cycle holding an
		// unopened commitment. Left alone, ONE of these players freezes the game
		// for the human too. What it forfeits is the world's own stake, which is
		// the one case where spending a stake unasked is not a rule violation.
		if (
			onChain.cycleNumber !== 0n &&
			Number(onChain.cycleNumber) < cycle.cycleNumber
		) {
			await settle(player, onChain);
			return;
		}

		if (cycle.commiting) await commit(player, cycle.cycleNumber, onChain);
		else await reveal(player, cycle.cycleNumber, onChain);
	}

	/**
	 * One pass over the table, and whether it sent anything.
	 *
	 * THE LOOP AROUND THIS IS THE FRAMEWORK'S and this is what it calls. The
	 * boolean is how `onActed` fires, read off the keyring's own counter either
	 * side of the work rather than a flag this file would have to reset.
	 */
	async function pass(): Promise<boolean> {
		const before = keys.sends();
		try {
			const cycle = await readCycle();
			const at = {
				cycleNumber: cycle.cycleNumber,
				commiting: cycle.isCommitPhase,
			};
			// IN SEQUENCE, NOT IN PARALLEL. Each of these players is a separate
			// account so their nonces do not collide, but they share one chain in
			// one worker, and a burst of three commits is three blocks nothing is
			// waiting for. Sequential also means a revert stops the pass instead
			// of being one rejected promise among several.
			for (const player of players) {
				await act(player, at);
			}
		} catch (err) {
			// A FAILED PASS IS NOT AN ERROR ANYBODY CAN ACT ON, and there is
			// nowhere to report it: these players have no UI. The next pass sees
			// the same chain and tries again, which is the right behaviour for
			// every transient cause (a commit that lost a race with somebody
			// else's advance, most of all). Swallowed HERE rather than in the loop,
			// which is what lets the loop insist a pass resolves.
			console.warn('an offline player could not act this pass', err);
		}
		// A send that reverted still happened, and the poke is worth doing anyway:
		// whatever refused it is a change in the world the advance client has not
		// seen yet.
		return keys.sends() > before;
	}

	return createSerialisedLoop({
		pass,
		onActed: params.onActed,
		pollInterval: params.pollInterval,
	});
}
