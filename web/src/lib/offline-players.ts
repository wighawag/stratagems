import {encodePacked, keccak256, parseAbi} from 'viem';
import {xyToBigIntID} from 'stratagems-common';
import type {DeploymentsStore} from '$lib/deployments-store';
import type {EIP1193ProviderLike} from '$lib/embedded';
import {
	createPlayedKeys,
	createSerialisedLoop,
	type SerialisedLoop,
} from '$lib/game/core/played';
import {playedSeatSecret} from '$lib/game/core/secret';
import {createCycleReader} from '$lib/game/core/commit-reveal/cycle';
import {
	buildCommitmentChain,
	chunkDueNext,
} from '$lib/game/core/commit-reveal/chain';
import {
	bondFor,
	costOfMoves,
	type StratagemsConfig,
} from '$lib/stratagems/game-config';
import {MOVE_ENCODING, type Move} from '$lib/stratagems/moves';
import {defaultColorOf} from '$lib/stratagems/faction';
import {testGemsDistributor} from '$lib/stratagems/test-gems';

/**
 * THE OTHER PLAYERS IN STRATAGEMS' OFFLINE WORLD, because a commit-reveal game
 * with one player is not one.
 *
 * SAME PATH AS THE TEMPLATE'S, AND STRATAGEMS' OWN CONTENT, as reveal-or-die
 * does: a cascade that touches the template's file conflicts here and resolves
 * to ours (step O, P1, of work/plans/join-template-commit-reveal.md). The
 * template's file says at length why a world needs players it plays (a cycle
 * with one waited-for member hides nothing, and under the manual policy members
 * who never act freeze the cycle for the human too) and why they hold nothing in
 * memory (the secret and the turn are DERIVED from chain, game, identity and
 * cycle, so a reload reconstructs them and a commitment is never stranded). All
 * of that holds here unchanged, and the machinery is the framework's
 * (`$lib/game/core/played`, `$lib/game/core/secret`).
 *
 * WHAT IS STRATAGEMS' HERE, and differs from the template's:
 *
 * - A TURN IS ONE MOVE (P6): a placement on a cell that is a pure function of
 *   (game, identity, cycle) within the 13 by 13 block around the origin, in the
 *   seat's default colour (`defaultColorOf`). The contract judges legality: a
 *   placement on another player's living cell is skipped, two on one empty cell
 *   collide. So a seat never reads the board, and plays no removals. These are
 *   not the NPCs a later phase wants (`work/notes/ideas/smarter-offline-seats.md`).
 * - A SEAT'S GEMS ONLY GO DOWN in stratagems: a placement moves a gem from the
 *   reserve onto its cell, and what a dead cell pays goes to WALLETS. So the
 *   template's answer to an empty reserve (commit an empty turn) would freeze
 *   the board after 32 cycles. Here a seat that cannot afford its move TAKES
 *   TEST GEMS from the world's distributor and restakes them (P5), exactly what
 *   the human can do from the HUD, so what the world can do the human can do,
 *   both ways. Only if that fails does it commit the empty turn, which keeps the
 *   cycle moving.
 *
 * AND BECAUSE IT IS DERIVED, THE DERIVATION IS A WIRE: a build that changes
 * {@link turnFor} or `playedSeatSecret` cannot open a commitment an earlier build
 * left on chain, which under the manual policy freezes the world. The commit
 * path below re-commits, in the commit phase, whenever the head on chain is not
 * one this build can open, as the template's does.
 */

/** One player the world plays: a key it holds, and who that key plays as. */
export type OfflinePlayer = {
	privateKey: `0x${string}`;
	/** The account this key is: it plays for itself, and receives test gems. */
	address: `0x${string}`;
	/** The identity as the contract spells it: the account, widened. */
	identity: bigint;
};

/** What `getCommitment` hands back. */
type Commitment = {hash: `0x${string}`; cycleNumber: bigint; bond: bigint};

/** `payee` on a commit or a reveal: nobody is being paid. */
const NO_PAYEE = '0x0000000000000000000000000000000000000000' as const;

const ERC20 = parseAbi([
	'function balanceOf(address owner) view returns (uint256)',
]);

/**
 * How far from the origin a played move may land, in cells, on each axis: the
 * camera opens on 24 by 24 cells (`game-config.ts`), so a 13 by 13 block around
 * the origin is always on screen.
 */
const PLAYED_TURN_SPREAD = 13;

/**
 * WHERE A PLAYED TURN COMES FROM, deterministically: one move, its cell a pure
 * function of the game, the seat and the cycle, its colour the seat's default
 * faction. A reload has to reproduce the same turn, or the commitment it
 * already made can never be opened.
 */
export function turnFor(params: {
	game: `0x${string}`;
	identity: bigint;
	cycleNumber: number;
}): Move[] {
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
	const account =
		`0x${params.identity.toString(16).padStart(40, '0')}` as const;
	return [{position: xyToBigIntID(x, y), color: defaultColorOf(account)}];
}

export function createOfflinePlayers(params: {
	provider: EIP1193ProviderLike;
	deployments: DeploymentsStore;
	config: StratagemsConfig;
	players: readonly OfflinePlayer[];
	/** How often to look. The framework's loop owns the default. */
	pollInterval?: number;
	/** Called after a pass in which a player actually SENT something. */
	onActed?: () => void;
}): SerialisedLoop {
	const {provider, deployments, config, players} = params;

	const records = deployments.get();
	const game = {
		address: records.contracts.Stratagems.address,
		abi: records.contracts.Stratagems.abi,
	};
	const chain = {
		id: records.chain.id,
		name: records.chain.name,
		nativeCurrency: records.chain.nativeCurrency,
		rpcUrls: {default: {http: [] as string[]}},
	};

	const keys = createPlayedKeys({provider, chain, contract: game});
	const publicClient = keys.publicClient;
	// THE DISTRIBUTOR, where the deployment has one (every offline world does):
	// a second keyring because the framework's sends to one contract.
	const distributor = testGemsDistributor(records as never);
	const distributorKeys = distributor
		? createPlayedKeys({provider, chain, contract: distributor})
		: undefined;
	const readCycle = createCycleReader({publicClient, contract: game});

	const sends = () => keys.sends() + (distributorKeys?.sends() ?? 0);

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

	function secretFor(player: OfflinePlayer, cycleNumber: number) {
		return playedSeatSecret({
			chainId: records.chain.id,
			contract: game.address,
			identity: player.identity,
			cycleNumber,
		});
	}

	function chainFor(actions: readonly Move[], secret: `0x${string}`) {
		return buildCommitmentChain<Move>({
			actions,
			secret,
			actionsPerReveal: config.actionsPerReveal,
			encoding: MOVE_ENCODING,
		});
	}

	/**
	 * Every turn this file could have committed for a player in a cycle: its
	 * move, and the empty turn it falls back to when it could not afford the move
	 * even after restaking. The reveal lets the hash decide between them.
	 */
	function candidateTurns(player: OfflinePlayer, cycleNumber: number) {
		return [
			turnFor({game: game.address, identity: player.identity, cycleNumber}),
			[],
		];
	}

	/**
	 * MORE GEMS, as the human gets them: test gems from the distributor into the
	 * seat's wallet, then all of its wallet's gems into its reserve. Only when the
	 * reserve cannot cover the move (P5).
	 */
	async function restake(player: OfflinePlayer): Promise<void> {
		if (!distributor || !distributorKeys) return;
		await distributorKeys.send(player.privateKey, {functionName: 'topup'});
		const held = (await publicClient.readContract({
			address: config.tokenAddress,
			abi: ERC20,
			functionName: 'balanceOf',
			args: [player.address],
		})) as bigint;
		if (held === 0n) return;
		await send(player, {
			functionName: 'addToReserve',
			args: [player.identity, held],
		});
	}

	async function turnToCommit(
		player: OfflinePlayer,
		cycleNumber: number,
	): Promise<{actions: Move[]; bond: bigint}> {
		const [wanted] = candidateTurns(player, cycleNumber);
		const cost = costOfMoves(config, wanted.length);
		let reserve = await reserveOf(player);
		if (reserve < cost) {
			await restake(player);
			reserve = await reserveOf(player);
		}
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
		const secret = secretFor(player, cycleNumber);
		// ALREADY DONE, checked before anything is spent: a head this build can
		// open, from this cycle, is left alone.
		if (Number(onChain.cycleNumber) === cycleNumber) {
			for (const actions of candidateTurns(player, cycleNumber)) {
				if (chunkDueNext(chainFor(actions, secret), onChain.hash) === 0) return;
			}
		}
		const {actions, bond} = await turnToCommit(player, cycleNumber);
		const commitment = chainFor(actions, secret);
		await send(player, {
			functionName: 'makeCommitment',
			args: [player.identity, commitment[0].hash, bond, NO_PAYEE],
			gas: config.gas.commit,
		});
	}

	async function reveal(
		player: OfflinePlayer,
		cycleNumber: number,
		onChain: Commitment,
	): Promise<void> {
		if (Number(onChain.cycleNumber) !== cycleNumber) return;
		const secret = secretFor(player, cycleNumber);
		for (const actions of candidateTurns(player, cycleNumber)) {
			const turn = chainFor(actions, secret);
			const from = chunkDueNext(turn, onChain.hash);
			if (from === undefined) continue;
			for (let i = from; i < turn.length; i++) {
				await send(player, {
					functionName: 'reveal',
					args: [
						player.identity,
						turn[i].actions,
						secret,
						turn[i].furtherActions,
						NO_PAYEE,
					],
					gas: config.gas.reveal,
				});
			}
			return;
		}
		console.warn(
			'an offline player is holding a commitment this build cannot open, so the cycle cannot close',
			{identity: player.identity, cycleNumber},
		);
	}

	/**
	 * Settle a commitment from a past cycle, WITH ITS CHUNKS when this file can
	 * rebuild the turn (one gem per committed move forfeited, the rest of the bond
	 * back), and forfeiting the whole bond only for a head no candidate
	 * reproduces.
	 */
	async function settle(
		player: OfflinePlayer,
		onChain: Commitment,
	): Promise<void> {
		const cycleNumber = Number(onChain.cycleNumber);
		const secret = secretFor(player, cycleNumber);
		for (const actions of candidateTurns(player, cycleNumber)) {
			const turn = chainFor(actions, secret);
			const from = chunkDueNext(turn, onChain.hash);
			if (from === undefined) continue;
			for (let i = from; i < turn.length; i++) {
				await send(player, {
					functionName: 'acknowledgeMissedReveal',
					args: [
						player.identity,
						turn[i].actions,
						secret,
						turn[i].furtherActions,
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
		// A COMMITMENT FROM A PAST CYCLE IS SETTLED RATHER THAN CARRIED: the
		// contract refuses every later commitment until it is, and the manual
		// cycle cannot close past it.
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

	async function pass(): Promise<boolean> {
		const before = sends();
		try {
			const cycle = await readCycle();
			const at = {
				cycleNumber: cycle.cycleNumber,
				commiting: cycle.isCommitPhase,
			};
			// In sequence: one chain in one tab, and a revert stops the pass.
			for (const player of players) {
				await act(player, at);
			}
		} catch (err) {
			// No UI to report to: the next pass sees the same chain and tries again.
			console.warn('an offline player could not act this pass', err);
		}
		return sends() > before;
	}

	return createSerialisedLoop({
		pass,
		onActed: params.onActed,
		pollInterval: params.pollInterval,
	});
}
