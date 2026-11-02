import {describe, it, expect, afterEach} from 'vitest';
import {
	createPublicClient,
	createWalletClient,
	custom,
	zeroAddress,
	type Account,
} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {createEmbeddedWorld, type EmbeddedWorld} from '$lib/embedded';
import {
	config,
	extensions,
} from 'template-commit-reveal-contracts/rocketh/config.js';
import {
	OFFLINE_DEPLOYMENT,
	offlineIdentityOf,
	playedByTheWorld,
	playedSeatDecider,
	stakeForOfflinePlayer,
} from '$lib/offline';
import {
	SEATS_BY_DEFAULT,
	seatsPlayedByTheWorld,
	tableOf,
} from '$lib/game/lobby/seats';
import {costOfPlacements, resolvePlacementConfig} from '$lib/placement/config';
import {buildPlacementChain} from '$lib/placement/commit-reveal';
import {
	createOfflinePlayers,
	playedTurnCells,
	turnFor,
} from '$lib/offline-players';
import {shareOf} from '$lib/placement/strategy';
import type {Table} from '$lib/game/lobby/seats';
// The secret is the FRAMEWORK's now, and asserting against it here is the point
// rather than an import detail: what a reload has to reproduce is what this
// world actually committed with.
import {playedSeatSecret} from '$lib/game/core/secret';
import {positionOf} from '$lib/placement/cells';

/**
 * THE OTHER PLAYERS, DRIVEN AGAINST A REAL CHAIN.
 *
 * No `.svelte.` infix, so this runs in the `server` project: node, no DOM. That
 * is the right harness and not a compromise - webevm runs under node, so a
 * whole world (a chain, this game's real deploy, three enrolled members and
 * four transactions a round) is testable without a browser, and what a browser
 * adds on top is covered by the offline e2e.
 *
 * WHY IT DRIVES `tick()` RATHER THAN `start()`. The loop is a `setInterval`,
 * and a test that waited for one would be asserting on a timer. Every pass this
 * file makes is one the timer would have made, in the same order, which is the
 * whole reason `tick` is exported.
 *
 * NOTHING HERE SPELLS AN IDENTITY OR A STAKE, and that is deliberate rather
 * than fastidious. Both differ between branches of this template - upstream a
 * player is an address with a bonded reserve, on the identity branch a token
 * with custody at stake - so a test that named either would be the sixteenth
 * file on that branch's divergence budget. It asks the world instead
 * (`stakeForOfflinePlayer`, `offlineIdentityOf`, `playedByTheWorld`), which is
 * exactly the seam `$lib/offline` exists to be, and the one place a branch
 * difference does surface is marked at the line.
 *
 * WHAT IT IS FOR, in one sentence: an offline world that enrols one member
 * hides nothing, because unanimity is satisfied by the only person present and
 * two of `advanceCycle`'s three conditions cannot be reached at all. Every
 * assertion below is about the third member existing and ACTING.
 */

const CHAIN_ID = 9007199254740127;

/**
 * THE SMALLEST TABLE, which is the one this file is about.
 *
 * Three seats: the human, and the two the world plays. The lobby lets a player
 * ask for more, and nothing below would read differently at eight - what these
 * tests assert is the BEHAVIOUR of a played player, and a player does not know
 * how many others there are. The count that has to be honoured is asserted
 * where it can be, against `getAttendance` in the world test.
 */
const TABLE = tableOf(SEATS_BY_DEFAULT);
const PLAYED = seatsPlayedByTheWorld(TABLE);

/**
 * The human, in this test: hardhat's account #1, as the world test uses it.
 *
 * It needs a key of its own rather than borrowing one of the world's, because
 * the whole point is that the third member acts INDEPENDENTLY of the loop
 * under test.
 */
const HUMAN = {
	privateKey:
		'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
	address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
} as const;

const PLAY_MONEY = 10n ** 24n;

let world: EmbeddedWorld | undefined;
afterEach(async () => {
	await world?.dispose();
	world = undefined;
});

type Sender = {account: Account; client: ReturnType<typeof createWalletClient>};
type Cycle = {cycleNumber: bigint; commiting: boolean};
type Attendance = {waitedFor: bigint; committed: bigint; revealed: bigint};
type Commitment = {hash: `0x${string}`; cycleNumber: bigint; bond: bigint};
type Cell = {totalStake: bigint; numClaimants: number};

/**
 * A world with three enrolled members: the human and the two the world plays.
 *
 * Provisioning is written out rather than reusing `provisionOfflinePlayer`,
 * which announces a wallet on `window` and therefore needs a browser. What it
 * does with the STAKE is the same call in the same order, which is the half
 * this file depends on, and the world test is what asserts the real hook makes
 * it.
 */
async function buildWorld() {
	return createEmbeddedWorld({
		chainId: CHAIN_ID,
		chain: {
			name: 'Offline',
			nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
			properties: {...config.chains[31337].properties},
		},
		rocketh: {config, extensions},
		environment: OFFLINE_DEPLOYMENT.environment,
		scripts: [...OFFLINE_DEPLOYMENT.scripts],
		data: {...OFFLINE_DEPLOYMENT.data},
		accounts: {...OFFLINE_DEPLOYMENT.accounts},
		initialBalances: {...OFFLINE_DEPLOYMENT.initialBalances},
		provision: async ({env, node}) => {
			for (const address of [
				HUMAN.address,
				...PLAYED.map((played) => played.address),
			]) {
				await node.provider.request({
					method: 'evm_setBalance',
					params: [address, `0x${PLAY_MONEY.toString(16)}`],
				} as never);
				await stakeForOfflinePlayer({env, player: address});
			}
		},
	});
}

async function playersOf(built: EmbeddedWorld) {
	return createOfflinePlayers({
		provider: built.provider,
		deployments: built.deployments,
		config: resolvePlacementConfig(built.deployments.get()),
		players: await playedByTheWorld({env: built.env, table: TABLE}),
	});
}

function clientsOf(built: EmbeddedWorld) {
	const records = built.deployments.get();
	const chain = {
		id: records.chain.id,
		name: records.chain.name,
		nativeCurrency: records.chain.nativeCurrency,
		rpcUrls: {default: {http: [] as string[]}},
	};
	const game = {
		address: records.contracts.Game.address,
		abi: records.contracts.Game.abi,
	};
	const publicClient = createPublicClient({
		chain,
		transport: custom(built.provider as never),
	});

	function senderFor(privateKey: `0x${string}`): Sender {
		const account = privateKeyToAccount(privateKey);
		return {
			account,
			client: createWalletClient({
				account,
				chain,
				transport: custom(built.provider as never),
			}),
		};
	}

	async function send(
		sender: Sender,
		request: Record<string, unknown>,
	): Promise<void> {
		const hash = await sender.client.writeContract({
			...game,
			chain: null,
			account: sender.account,
			...request,
		} as never);
		const receipt = await publicClient.waitForTransactionReceipt({hash});
		expect(receipt.status, String(request.functionName)).toBe('success');
	}

	// The cast is the same one the app's own readers make at this boundary: the
	// records carry a runtime ABI, and a helper that takes a function NAME cannot
	// have viem infer the argument tuple from it.
	async function read<T>(functionName: string, args: unknown[] = []) {
		return (await publicClient.readContract({
			...game,
			functionName,
			args,
		} as never)) as T;
	}

	return {game, publicClient, senderFor, send, read};
}

/**
 * The human takes a turn, in the two halves a manual cycle needs.
 *
 * A fixed secret and one placement on the origin: what this file is testing is
 * the OTHER two players, so the third member is only required to be real, to
 * act independently, and to be somewhere the played turns are not (they land
 * within a block around the origin, so a shared cell would still be a correct
 * board - it would just stop the stake assertion meaning what it says).
 */
const HUMAN_SECRET =
	'0x1111111111111111111111111111111111111111111111111111111111111111' as const;
const HUMAN_CELL = 0n;

describe('the other players in the offline world', () => {
	it('enrols THREE waited-for members, which is what makes the cycle hide anything', async () => {
		world = await buildWorld();
		const {read} = clientsOf(world);

		// One member satisfies unanimity by existing: the commit phase would be
		// theatre, and `advanceCycle` could never reach `StillWaitingToCommit` or
		// `StillWaitingToReveal`. Two is a duel. Three is the smallest number at
		// which "everyone" and "the other one" are different statements.
		const attendance = await read<Attendance>('getAttendance');
		expect(attendance.waitedFor).toBe(3n);
		expect(attendance.committed).toBe(0n);
	});

	it('plays a whole round: three commits, an advance, three reveals, an advance', async () => {
		world = await buildWorld();
		const {send, read, senderFor} = clientsOf(world);
		const placement = resolvePlacementConfig(world.deployments.get());
		const players = await playersOf(world);
		const human = senderFor(HUMAN.privateKey);
		const humanIdentity = await offlineIdentityOf({
			env: world.env,
			player: HUMAN.address,
		});
		const records = world.deployments.get();

		const opening = await read<Cycle>('getCycle');
		expect(opening.cycleNumber).toBe(2n);
		expect(opening.commiting).toBe(true);

		// THE TWO PLAYED PLAYERS COMMIT ON A PASS OF THEIR OWN, with nobody
		// waiting for them and nothing in memory: the turn and the secret are
		// derived from (chain, game, identity, cycle) every time they are needed.
		await players.tick();
		expect((await read<Attendance>('getAttendance')).committed).toBe(2n);

		// AND THE CYCLE STILL CANNOT MOVE, which is the assertion a one-player
		// world could not make. `StillWaitingToCommit` is one of the two
		// conditions that were unreachable before there was anybody else.
		await expect(
			send(human, {functionName: 'advanceCycle', args: []}),
		).rejects.toThrow();

		const humanTurn = [{cellID: HUMAN_CELL}];
		const humanChain = buildPlacementChain({
			actions: humanTurn,
			secret: HUMAN_SECRET,
			actionsPerReveal: placement.actionsPerReveal,
		});
		await send(human, {
			functionName: 'makeCommitment',
			args: [
				humanIdentity,
				humanChain[0].hash,
				costOfPlacements(placement, humanTurn.length),
				zeroAddress,
			],
		});

		const committed = await read<Attendance>('getAttendance');
		expect(committed.committed).toBe(3n);
		expect(committed.committed).toBe(committed.waitedFor);

		await send(human, {functionName: 'advanceCycle', args: []});
		expect((await read<Cycle>('getCycle')).commiting).toBe(false);

		// AND NOW THE OTHER CONDITION: the cycle cannot close while the played
		// players still owe a reveal, so an offline world whose extra members
		// never acted would be FROZEN rather than quiet - for the human too.
		await expect(
			send(human, {functionName: 'advanceCycle', args: []}),
		).rejects.toThrow();

		await players.tick();
		expect((await read<Attendance>('getAttendance')).revealed).toBe(2n);

		await send(human, {
			functionName: 'reveal',
			args: [
				humanIdentity,
				humanTurn,
				HUMAN_SECRET,
				humanChain[0].furtherActions,
				zeroAddress,
			],
		});

		await send(human, {functionName: 'advanceCycle', args: []});
		const next = await read<Cycle>('getCycle');
		expect(next.cycleNumber).toBe(3n);
		expect(next.commiting).toBe(true);

		// WHAT THE PLAYED TURNS ACTUALLY DID, read off the board rather than
		// inferred from the tally: a turn that committed and revealed nothing
		// would satisfy every count above and leave the human with an empty board
		// and no evidence anybody else is there.
		//
		// THE CLAIMANT COUNT AND NOT THE STAKE, for the reason `e2e/fixtures/game.ts`
		// had to swap to the same quantity on the identity branch: a placement is
		// free there, so the stake on a cell never moves and an assertion against
		// it would be trivially true of a board nothing had reached.
		for (const played of await playedByTheWorld({
			env: world.env,
			table: TABLE,
		})) {
			const [action] = turnFor({
				game: records.contracts.Game.address,
				identity: played.identity,
				cycleNumber: 2,
			});
			const cell = await read<Cell>('getCell', [action.cellID]);
			expect(
				cell.numClaimants,
				JSON.stringify(positionOf(action.cellID)),
			).toBeGreaterThanOrEqual(1);
		}
	});

	it('reconstructs the same turn and the same secret after a reload', async () => {
		// THE LOAD-BEARING PROPERTY. These players hold nothing between passes, so
		// a browser that was closed between a commit and its reveal comes back
		// able to open it. If it could not, `advanceCycle` would refuse to close
		// the cycle - correctly - and the human's game would stop for good with
		// their stake inside it.
		world = await buildWorld();
		const {read} = clientsOf(world);
		const records = world.deployments.get();
		const [first] = await playedByTheWorld({env: world.env, table: TABLE});

		await (await playersOf(world)).tick();
		const before = await read<Commitment>('getCommitment', [first.identity]);
		expect(before.cycleNumber).toBe(2n);

		// REBUILT FROM THE PUBLIC INPUTS ALONE, which is what a reload has.
		const placement = resolvePlacementConfig(records);
		const rebuilt = buildPlacementChain({
			actions: turnFor({
				game: records.contracts.Game.address,
				identity: first.identity,
				cycleNumber: 2,
			}),
			secret: playedSeatSecret({
				chainId: records.chain.id,
				contract: records.contracts.Game.address,
				identity: first.identity,
				cycleNumber: 2,
			}),
			actionsPerReveal: placement.actionsPerReveal,
		});
		expect(rebuilt[0].hash.toLowerCase()).toBe(before.hash.toLowerCase());
	});

	it('replaces a commitment it could not open, while the commit phase can still take one', async () => {
		// THE ONE WAY THIS WORLD COULD FREEZE, closed from the only side it can be
		// closed from. A commitment nothing can open blocks every advance for
		// ever: the contract refuses to close a cycle holding one, and
		// a settlement refuses a commitment from the CURRENT cycle,
		// so the cycle never becomes a past one. It takes a build that changed the
		// derivation to reach, and the commit phase is the last moment anything
		// can be done about it - so a played player compares the HEAD rather than
		// the cycle number, and re-commits when they disagree.
		world = await buildWorld();
		const {send, read, senderFor} = clientsOf(world);
		const [first] = await playedByTheWorld({env: world.env, table: TABLE});
		const stranger = senderFor(PLAYED[0].privateKey);

		const notOurs =
			'0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as const;
		await send(stranger, {
			functionName: 'makeCommitment',
			args: [first.identity, notOurs, 0n, zeroAddress],
		});
		expect(
			(await read<Commitment>('getCommitment', [first.identity])).hash,
		).toBe(notOurs);

		await (await playersOf(world)).tick();

		const after = await read<Commitment>('getCommitment', [first.identity]);
		expect(after.hash).not.toBe(notOurs);
		expect(after.cycleNumber).toBe(2n);
		// TWO, WHICH IS ONE PER PLAYED PLAYER AND NOT THREE. The replacement is
		// counted once: the contract records a commitment per player per cycle,
		// so re-committing cannot push the tally past the membership and make
		// unanimity permanently unreachable - which is the way this repair could
		// have been worse than the thing it repairs.
		expect((await read<Attendance>('getAttendance')).committed).toBe(2n);
	});

	it('commits an EMPTY turn once it can no longer afford a bond, and opens that too', async () => {
		// WHAT HAPPENS WHEN A PLAYED PLAYER RUNS OUT, which is not hypothetical
		// upstream: the sale hands out ten tokens and a placement costs one, so a
		// played player is broke after ten cycles of an ordinary session.
		//
		// Topping them back up would be the hazard the world test already guards
		// for the human, one player over - a stake that can be refilled is not a
		// stake. Refusing to commit would freeze the cycle for EVERYBODY, because
		// unanimity waits for them. An empty turn costs nothing, bonds nothing,
		// resolves to nothing and keeps the game moving.
		world = await buildWorld();
		const {send, read, senderFor} = clientsOf(world);
		const placement = resolvePlacementConfig(world.deployments.get());
		const [first] = await playedByTheWorld({env: world.env, table: TABLE});

		if (placement.placementCost === 0n) {
			// THE ONE BRANCH DIFFERENCE THIS FILE HAS, stated rather than hidden
			// behind a green run. Where a placement is free the bond is always
			// zero, so "can they afford it" has no false case and the empty turn
			// is unreachable by construction. That is worth asserting, because it
			// is the claim the rest of this test would otherwise be making
			// vacuously.
			expect(costOfPlacements(placement, 99)).toBe(0n);
			return;
		}

		// Down to one wei: too little for a placement, and NOT zero, because
		// emptying a reserve is how a player leaves and the cycle would stop
		// waiting for them altogether.
		const broke = senderFor(PLAYED[0].privateKey);
		const held = await read<bigint>('getReserve', [first.identity]);
		await send(broke, {
			functionName: 'withdrawFromReserve',
			args: [held - 1n],
		});
		expect(await read<bigint>('getReserve', [first.identity])).toBeLessThan(
			placement.placementCost,
		);
		expect((await read<Attendance>('getAttendance')).waitedFor).toBe(3n);

		await (await playersOf(world)).tick();

		const commitment = await read<Commitment>('getCommitment', [
			first.identity,
		]);
		expect(commitment.cycleNumber).toBe(2n);
		expect(commitment.bond).toBe(0n);

		// AND IT IS OPENABLE, which is the half a reveal that re-derived the turn
		// would get wrong: what is on chain depends on what the reserve held at
		// COMMIT time, so the reveal matches the head against both turns this
		// file could have built and lets the hash decide.
		const human = senderFor(HUMAN.privateKey);
		const humanIdentity = await offlineIdentityOf({
			env: world.env,
			player: HUMAN.address,
		});
		await send(human, {
			functionName: 'makeCommitment',
			args: [
				humanIdentity,
				'0x444444444444444444444444444444444444444444444444',
				0n,
				zeroAddress,
			],
		});
		await send(human, {functionName: 'advanceCycle', args: []});
		await (await playersOf(world)).tick();
		expect((await read<Attendance>('getAttendance')).revealed).toBe(2n);
	});

	it('comes back after a tab was closed mid-cycle and opens what it left behind', async () => {
		// THE RECONSTRUCTION PROPERTY, ARRIVING AS LIVENESS. A played player that
		// committed and then forgot is not a player with a lost turn, it is a
		// FROZEN world: no advance can close a cycle holding an unopened
		// commitment, so the human's game stops for good with their stake inside
		// it. Here the whole loop is thrown away between the commit and the
		// reveal, which is what a reload is.
		world = await buildWorld();
		const {send, read, senderFor} = clientsOf(world);
		const human = senderFor(HUMAN.privateKey);
		const humanIdentity = await offlineIdentityOf({
			env: world.env,
			player: HUMAN.address,
		});
		const placement = resolvePlacementConfig(world.deployments.get());

		await (await playersOf(world)).tick();

		const humanChain = buildPlacementChain({
			actions: [{cellID: HUMAN_CELL}],
			secret: HUMAN_SECRET,
			actionsPerReveal: placement.actionsPerReveal,
		});
		await send(human, {
			functionName: 'makeCommitment',
			args: [
				humanIdentity,
				humanChain[0].hash,
				costOfPlacements(placement, 1),
				zeroAddress,
			],
		});
		await send(human, {functionName: 'advanceCycle', args: []});
		await send(human, {
			functionName: 'reveal',
			args: [
				humanIdentity,
				[{cellID: HUMAN_CELL}],
				HUMAN_SECRET,
				humanChain[0].furtherActions,
				zeroAddress,
			],
		});

		// Stuck, exactly as designed: two commitments are unopened.
		await expect(
			send(human, {functionName: 'advanceCycle', args: []}),
		).rejects.toThrow();

		// A LOOP THAT NEVER SAW THE COMMIT, and it opens both of them anyway.
		await (await playersOf(world)).tick();
		await send(human, {functionName: 'advanceCycle', args: []});
		expect((await read<Cycle>('getCycle')).cycleNumber).toBe(3n);
	});

	it('never lets an unopened commitment become a PAST one, which is what the acknowledge branch is insurance against', async () => {
		// MEASURED RATHER THAN ASSUMED, because it decides whether a played
		// player's settlement can ever fire in this world. It
		// cannot: under the manual policy the cycle only moves when somebody
		// pushes it, and the push refuses while any commitment in the cycle is
		// unopened - so a commitment cannot survive into a LATER cycle, which is
		// the only state a settlement will touch.
		//
		// The branch stays, because it is insurance rather than dead weight: this
		// file does not assume the policy, and on a TIMED deployment the clock
		// moves past an unopened commitment without asking anybody. What it does
		// mean is that the hazard worth guarding HERE is the other one - a
		// commitment in the CURRENT cycle that this build cannot open, which
		// neither settlement will touch and which the test above is
		// about.
		world = await buildWorld();
		const {send, read, senderFor} = clientsOf(world);
		const human = senderFor(HUMAN.privateKey);
		const humanIdentity = await offlineIdentityOf({
			env: world.env,
			player: HUMAN.address,
		});
		const [first] = await playedByTheWorld({env: world.env, table: TABLE});

		await (await playersOf(world)).tick();
		await send(human, {
			functionName: 'makeCommitment',
			args: [
				humanIdentity,
				'0x333333333333333333333333333333333333333333333333',
				0n,
				zeroAddress,
			],
		});
		await send(human, {functionName: 'advanceCycle', args: []});

		// Nobody reveals. The cycle stays where it is, for everyone, for ever.
		await expect(
			send(human, {functionName: 'advanceCycle', args: []}),
		).rejects.toThrow();
		const stuck = await read<Cycle>('getCycle');
		expect(stuck.cycleNumber).toBe(2n);
		expect(stuck.commiting).toBe(false);

		// And a played player's commitment is therefore still a CURRENT one,
		// which the contract refuses to settle, even to the seat itself.
		expect(
			(await read<Commitment>('getCommitment', [first.identity])).cycleNumber,
		).toBe(2n);
		await expect(
			send(senderFor(PLAYED[0].privateKey), {
				functionName: 'forfeitMissedReveal',
				args: [first.identity],
			}),
		).rejects.toThrow(/CanStillReveal/);
	});
});

/**
 * SEATS AT THE `greedy` LEVEL: the game's strategy asked once per cycle, its
 * turn stored before the commit and read back by the reveal (stratagems' port
 * plan, step A1, A1-2 to A1-5 and A1-8).
 *
 * The same world as above, with the same keys: a level changes how a seat
 * plays, never which address it plays as, so `buildWorld` funds them as it
 * always has.
 */
describe('the world seats at the greedy level', () => {
	const GREEDY_TABLE = tableOf(SEATS_BY_DEFAULT, 1, ['greedy', 'greedy']);

	function memoryStorage() {
		const map = new Map<string, string>();
		let failing = false;
		return {
			getItem: (key: string) => map.get(key) ?? null,
			setItem: (key: string, value: string) => {
				if (failing) throw new Error('the storage refused the write');
				map.set(key, value);
			},
			fail: () => void (failing = true),
		};
	}

	/** The world's seats as `$lib/offline` builds them, over `storage`. */
	async function seatsOf(
		built: EmbeddedWorld,
		table: Table,
		storage: ReturnType<typeof memoryStorage>,
	) {
		const played = await playedByTheWorld({env: built.env, table});
		const decisions: {ms: number; claimed: number; simulated: number}[] = [];
		const decider = playedSeatDecider(built, played, {
			storage,
			onDecided: (measure) => void decisions.push(measure),
		});
		const players = createOfflinePlayers({
			provider: built.provider,
			deployments: built.deployments,
			config: resolvePlacementConfig(built.deployments.get()),
			players: played,
			...(decider ? {strategy: decider.strategy, turns: decider.turns} : {}),
		});
		return {
			players,
			played,
			decisions,
			decider,
			dispose: () => decider?.sandbox.dispose(),
		};
	}

	/** The human's turn in a cycle, both halves, with the seats acting between. */
	async function playCycle(
		built: EmbeddedWorld,
		players: {tick: () => Promise<void>},
		humanTurn: {cellID: bigint}[],
	) {
		const {send, senderFor} = clientsOf(built);
		const placement = resolvePlacementConfig(built.deployments.get());
		const human = senderFor(HUMAN.privateKey);
		const identity = await offlineIdentityOf({
			env: built.env,
			player: HUMAN.address,
		});
		const chain = buildPlacementChain({
			actions: humanTurn,
			secret: HUMAN_SECRET,
			actionsPerReveal: placement.actionsPerReveal,
		});
		await players.tick();
		await send(human, {
			functionName: 'makeCommitment',
			args: [
				identity,
				chain[0].hash,
				costOfPlacements(placement, humanTurn.length),
				zeroAddress,
			],
		});
		await send(human, {functionName: 'advanceCycle', args: []});
		await players.tick();
		for (const chunk of chain) {
			await send(human, {
				functionName: 'reveal',
				args: [
					identity,
					chunk.actions,
					HUMAN_SECRET,
					chunk.furtherActions,
					zeroAddress,
				],
			});
		}
		await send(human, {functionName: 'advanceCycle', args: []});
	}

	/** A seat's share of the stake on every cell it holds, summed (A1-8's objective). */
	async function shareHeldBy(built: EmbeddedWorld, identity: bigint) {
		const {read} = clientsOf(built);
		let total = 0n;
		for (const cellID of playedTurnCells()) {
			const cell = await read<Cell>('getCell', [cellID]);
			if (cell.totalStake === 0n) continue;
			const playerStake = await read<bigint>('getStakeOnCell', [
				cellID,
				identity,
			]);
			total += shareOf({totalStake: cell.totalStake, playerStake});
		}
		return total;
	}

	it('decides once, stores the turn before committing it, and reveals what it stored', async () => {
		world = await buildWorld();
		const {read} = clientsOf(world);
		const records = world.deployments.get();
		const placement = resolvePlacementConfig(records);
		const storage = memoryStorage();
		const seats = await seatsOf(world, GREEDY_TABLE, storage);
		expect(seats.played.map((seat) => seat.level)).toEqual([
			'greedy',
			'greedy',
		]);

		await seats.players.tick();
		await seats.players.tick();
		expect((await read<Attendance>('getAttendance')).committed).toBe(2n);
		// ONCE PER SEAT AND CYCLE, however many passes the commit phase sees.
		expect(seats.decisions).toHaveLength(2);

		const stored: bigint[] = [];
		for (const seat of seats.played) {
			const turn = seats.decider?.turns.get(seat.identity, 2);
			expect(turn).toHaveLength(1);
			stored.push(turn![0].cellID);
			// THE HEAD ON CHAIN IS THE STORED TURN'S, under the derived secret.
			const head = buildPlacementChain({
				actions: turn!,
				secret: playedSeatSecret({
					chainId: records.chain.id,
					contract: records.contracts.Game.address,
					identity: seat.identity,
					cycleNumber: 2,
				}),
				actionsPerReveal: placement.actionsPerReveal,
			})[0].hash;
			const onChain = await read<Commitment>('getCommitment', [seat.identity]);
			expect(onChain.hash.toLowerCase()).toBe(head.toLowerCase());
		}
		// Every candidate is empty on a new board, so each picked one of the
		// block's cells, and the seeded random made them differ.
		expect(new Set(stored).size).toBe(2);

		await playCycle(world, seats.players, [{cellID: HUMAN_CELL}]);
		expect((await read<Cycle>('getCycle')).cycleNumber).toBe(3n);
		for (const cellID of stored) {
			expect(
				(await read<Cell>('getCell', [cellID])).numClaimants,
			).toBeGreaterThanOrEqual(1);
		}
		seats.dispose();
	});

	it('reveals its stored turn after a reload in the reveal phase, without deciding again', async () => {
		world = await buildWorld();
		const {read, send, senderFor} = clientsOf(world);
		const storage = memoryStorage();
		const before = await seatsOf(world, GREEDY_TABLE, storage);
		await before.players.tick();
		before.dispose();

		const human = senderFor(HUMAN.privateKey);
		const identity = await offlineIdentityOf({
			env: world.env,
			player: HUMAN.address,
		});
		await send(human, {
			functionName: 'makeCommitment',
			args: [
				identity,
				'0x555555555555555555555555555555555555555555555555',
				0n,
				zeroAddress,
			],
		});
		await send(human, {functionName: 'advanceCycle', args: []});

		// THE RELOAD: a new loop, a new sandbox, the same storage.
		const after = await seatsOf(world, GREEDY_TABLE, storage);
		await after.players.tick();
		expect((await read<Attendance>('getAttendance')).revealed).toBe(2n);
		expect(after.decisions).toHaveLength(0);
		after.dispose();
	});

	it('re-decides a lost record in the commit phase, and repairs the head if it differs', async () => {
		world = await buildWorld();
		const {read} = clientsOf(world);
		const first = await seatsOf(world, GREEDY_TABLE, memoryStorage());
		await first.players.tick();
		const heads = await Promise.all(
			first.played.map((seat) =>
				read<Commitment>('getCommitment', [seat.identity]),
			),
		);
		first.dispose();

		// A STORAGE THAT LOST THE RECORD BUT KEPT THE WORLD. The board has not
		// moved in the commit phase, so the same seeded input decides the same
		// turn and the head on chain is left alone.
		const again = await seatsOf(world, GREEDY_TABLE, memoryStorage());
		await again.players.tick();
		expect(again.decisions).toHaveLength(2);
		for (const [i, seat] of again.played.entries()) {
			const now = await read<Commitment>('getCommitment', [seat.identity]);
			expect(now.hash).toBe(heads[i].hash);
		}
		expect((await read<Attendance>('getAttendance')).committed).toBe(2n);
		again.dispose();
	});

	it('sends nothing when the turn cannot be stored', async () => {
		world = await buildWorld();
		const {read} = clientsOf(world);
		const storage = memoryStorage();
		const seats = await seatsOf(world, GREEDY_TABLE, storage);
		storage.fail();
		await seats.players.tick();
		expect((await read<Attendance>('getAttendance')).committed).toBe(0n);
		for (const seat of seats.played) {
			expect(
				(await read<Commitment>('getCommitment', [seat.identity])).cycleNumber,
			).toBe(0n);
		}
		seats.dispose();
	});

	it('decides the same turns in two worlds built from the same inputs', async () => {
		const turns: (bigint | undefined)[][] = [];
		for (let run = 0; run < 2; run++) {
			world = await buildWorld();
			const seats = await seatsOf(world, GREEDY_TABLE, memoryStorage());
			await seats.players.tick();
			turns.push(
				seats.played.map(
					(seat) => seats.decider?.turns.get(seat.identity, 2)?.[0]?.cellID,
				),
			);
			seats.dispose();
			await world.dispose();
			world = undefined;
		}
		expect(turns[0].every((cell) => cell !== undefined)).toBe(true);
		expect(turns[1]).toEqual(turns[0]);
	});

	it("holds at least random's share on a seeded board, and strictly more where random's cell is contested", async () => {
		// THE SAME WORLD TWICE, the first seat greedy in one and random in the
		// other, everything else equal: the human, the second seat (random in
		// both) and the chain id. In the contested case the human takes, in the
		// cycle before, the cell the random seat will play next, so on the board
		// the second turn is decided on, random's cell is shared and greedy can
		// see it is.
		const measured: Record<string, {greedy: bigint; random: bigint}> = {};
		for (const contested of [false, true]) {
			const share: Record<string, bigint> = {};
			for (const level of ['greedy', 'random']) {
				world = await buildWorld();
				const records = world.deployments.get();
				const table = tableOf(SEATS_BY_DEFAULT, 1, [level, 'random']);
				const seats = await seatsOf(world, table, memoryStorage());
				const [first] = seats.played;
				const nextRandomCell = turnFor({
					game: records.contracts.Game.address,
					identity: first.identity,
					cycleNumber: 3,
				})[0].cellID;
				await playCycle(world, seats.players, [
					{cellID: contested ? nextRandomCell : HUMAN_CELL},
				]);
				// THE GAIN OF THE TURN DECIDED ON THIS BOARD, and only that one. The
				// first cycle's turns were decided on an empty board, where neither
				// level can see what anybody commits beside it (a greedy seat may
				// meet the human's simultaneous placement, and did: once in a
				// hundred and sixty-nine).
				const held = await shareHeldBy(world, first.identity);
				await playCycle(world, seats.players, [{cellID: HUMAN_CELL}]);
				share[level] = (await shareHeldBy(world, first.identity)) - held;
				seats.dispose();
				await world.dispose();
				world = undefined;
			}
			measured[String(contested)] = {
				greedy: share.greedy,
				random: share.random,
			};
		}
		expect(measured['false'].greedy).toBeGreaterThanOrEqual(
			measured['false'].random,
		);
		expect(measured['true'].greedy).toBeGreaterThan(measured['true'].random);
	});

	it('decides within budget on a board of 30 claimed cells, in one simulation', async () => {
		// A1-11's measurement, in node: the human claims 30 cells of the block
		// in one turn (three stakes' worth), then a greedy seat decides on that
		// board. One `getCellsInZones`, one `getStakeOnCell` per claimed cell,
		// one `resolvePlacements` over the 169 candidates.
		world = await buildWorld();
		const env = world.env as unknown as {
			get: (name: string) => never;
			namedAccounts: Record<string, `0x${string}`>;
			execute: (deployment: never, args: unknown) => Promise<unknown>;
		};
		for (let i = 0; i < 2; i++) {
			await env.execute(env.get('StakeSale'), {
				account: env.namedAccounts.deployer,
				functionName: 'purchase',
				args: [HUMAN.address, zeroAddress, 0n],
				value: config.data.sale.default.price,
			});
		}
		const cells = playedTurnCells();
		const claimed = cells.slice(0, 30).map((cellID) => ({cellID}));
		const random = await seatsOf(world, TABLE, memoryStorage());
		await playCycle(world, random.players, claimed);

		const seats = await seatsOf(world, GREEDY_TABLE, memoryStorage());
		await seats.players.tick();
		expect(seats.decisions).toHaveLength(2);
		const [decision] = seats.decisions;
		expect(decision.claimed).toBeGreaterThanOrEqual(30);
		process.stderr.write(
			`greedy decision on ${decision.claimed} claimed cells, ${decision.simulated} simulated: ${seats.decisions
				.map((d) => `${d.ms} ms`)
				.join(', ')}\n`,
		);
		expect(decision.ms).toBeLessThan(500);
		// It picked a cell nobody held, which is what its objective asks.
		for (const seat of seats.played) {
			const [turn] = seats.decider!.turns.get(seat.identity, 3)!;
			expect(claimed.some((c) => c.cellID === turn.cellID)).toBe(false);
		}
		seats.dispose();
	});
});
