import {expect} from 'earl';
import {describe, it} from 'node:test'; // using node:test as hardhat v3 do not support vitest
import {network} from 'hardhat';
import {
	setupFixtures,
	idOf,
	enterGame,
	deployGameWith,
	CYCLE_POLICY,
	commitmentChain,
	commitmentHashFor,
	revealTurn,
	DEFAULT_ACTIONS_PER_REVEAL,
	NO_FURTHER_ACTIONS,
	type CyclePolicy,
	type Placement,
} from './utils/index.js';
import {parseEther, zeroAddress} from 'viem';
import {generatePrivateKey, privateKeyToAccount} from 'viem/accounts';
import {delegationMessage} from '@etherplay/delegation';

const {provider, networkHelpers} = await network.connect();
const {deployAll} = setupFixtures(provider);

/** Pack a cell coordinate the way PositionUtils does: y in the high 32 bits. */
function cellAt(x: number, y: number): bigint {
	const ux = BigInt.asUintN(32, BigInt(x));
	const uy = BigInt.asUintN(32, BigInt(y));
	return (uy << 32n) + ux;
}

const SECRET_A =
	'0x0000000000000000000000000000000000000000000000000000000000000a11';
const SECRET_B =
	'0x0000000000000000000000000000000000000000000000000000000000000b22';

describe('Game', function () {
	it('places a cell through a full commit/reveal submission', async function () {
		const {
			env,
			Game,
			GameToken,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			advanceToRevealPhase,
			getCycleNumber,
			getTimestamp,
		} = await networkHelpers.loadFixture(deployAll);

		const player = unnamedAccounts[0];
		const {cycleNumber: startCycleNumber} = getCycleNumber(
			await getTimestamp(),
		);
		await advanceToCycleNumber(startCycleNumber + 2, true);

		// Fund and stake.
		const identity = await enterGame({env, Game, GameToken}, player);

		expect(
			await env.read(Game, {functionName: 'getReserve', args: [identity]}),
		).toEqual(parseEther('10'));

		// Commit.
		//
		// The leading argument is the IDENTITY, which is what a real client sends
		// (it plays through a delegate, so "whoever is calling" would be the wrong
		// answer); the trailing zeroAddress is `payee`, which is unrelated. See
		// the delegation tests below.
		const placements: Placement[] = [{cellID: cellAt(3, 4)}];
		await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [
				identity,
				commitmentHashFor(placements, SECRET_A, actionsPerReveal),
				parseEther('5'),
				zeroAddress,
			],
		});

		// Reveal.
		const {cycleNumber} = getCycleNumber(await getTimestamp());
		await advanceToRevealPhase(cycleNumber, true);
		await revealTurn(
			{env, Game},
			{
				account: player,
				identity,
				placements,
				secret: SECRET_A,
				actionsPerReveal,
			},
		);

		const cell = (await env.read(Game, {
			functionName: 'getCell',
			args: [cellAt(3, 4)],
		})) as {totalStake: bigint; numClaimants: number};

		expect(cell.totalStake).toEqual(parseEther('1'));
		expect(cell.numClaimants).toEqual(1);

		// The placement was paid for out of the reserve.
		expect(
			await env.read(Game, {functionName: 'getReserve', args: [identity]}),
		).toEqual(parseEther('9'));
	});

	/**
	 * The property that makes commit-reveal worth doing.
	 *
	 * Reveals arrive in whatever order the mempool delivers them, so the board
	 * that results from a set of commitments must not depend on that order. If
	 * it does, whoever pays the most gas decides the outcome, and committing
	 * bought nothing.
	 *
	 * This is easy to break by accident: "the first to reveal takes the cell"
	 * and "reject a cell that is already taken" both look like reasonable rules
	 * and both violate it. So it is asserted directly rather than trusted.
	 *
	 * IT IS REPLAYED UNDER EVERY CYCLE POLICY, because the policy is the place
	 * the same failure can reappear one level up: a cycle that could be pushed
	 * forward by a subset would let whoever is quickest decide what everyone
	 * else got, which is the reveal race wearing a clock. The board must come
	 * out identical whether the phase turned over on a timer or because the
	 * players were all present and said so.
	 */
	it('reaches the same board whichever order the reveals arrive in', async function () {
		async function boardAfterRevealsInOrder(
			revealFirst: 'A' | 'B',
			policy: CyclePolicy,
		): Promise<{
			contested: {totalStake: bigint; numClaimants: number};
			listed: string[];
		}> {
			const fixtures = await networkHelpers.loadFixture(deployAll);
			const {
				env,
				Game: TimedGame,
				GameToken,
				actionsPerReveal,
				unnamedAccounts,
				advanceToCycleNumber,
				advanceToRevealPhase,
				getCycleNumber,
				getTimestamp,
			} = fixtures;

			const playerA = unnamedAccounts[0];
			const playerB = unnamedAccounts[1];

			const {cycleNumber: startCycleNumber} = getCycleNumber(
				await getTimestamp(),
			);
			await advanceToCycleNumber(startCycleNumber + 2, true);

			// The shipped deployment is the timed one, so that policy is played
			// on the real thing rather than on a copy of it.
			const manual = policy === CYCLE_POLICY.Manual;
			const Game =
				policy === CYCLE_POLICY.Timed
					? TimedGame
					: await deployGameWith(fixtures, {
							name: `Game_replay_${policy}`,
							cyclePolicy: policy,
							commitPhaseDuration: manual ? 0n : 30n,
							revealPhaseDuration: manual ? 0n : 10n,
						});

			/** Get to the reveal phase the way this policy allows. */
			async function openRevealPhase() {
				if (policy === CYCLE_POLICY.Timed) {
					const {cycleNumber} = getCycleNumber(await getTimestamp());
					await advanceToRevealPhase(cycleNumber, true);
					return;
				}
				// Both players have committed, so the phase may be brought
				// forward. Anyone may do it; it is nobody's move.
				await env.execute(Game, {
					account: playerA,
					functionName: 'advanceCycle',
					args: [],
				});
			}

			// The whole fixture bag with the game to enter overriding the
			// deployed one: how a player gets IN is the game's, and it is what
			// `utils` exists to differ about between branches.
			const identityA = await enterGame({...fixtures, Game}, playerA);
			const identityB = await enterGame({...fixtures, Game}, playerB);

			// Both players commit to the SAME cell, blind to each other, and each
			// also takes a cell of their own. The private cells are what make the
			// zone LISTING order-sensitive if anything is: they are claimed for
			// the first time by different reveals, so whichever lands first is
			// indexed first.
			const contested = cellAt(7, 7);
			const onlyA = cellAt(6, 7);
			const onlyB = cellAt(5, 7);
			const placementsA: Placement[] = [{cellID: contested}, {cellID: onlyA}];
			const placementsB: Placement[] = [{cellID: contested}, {cellID: onlyB}];

			await env.execute(Game, {
				account: playerA,
				functionName: 'makeCommitment',
				args: [
					identityA,
					commitmentHashFor(placementsA, SECRET_A, actionsPerReveal),
					parseEther('5'),
					zeroAddress,
				],
			});
			await env.execute(Game, {
				account: playerB,
				functionName: 'makeCommitment',
				args: [
					identityB,
					commitmentHashFor(placementsB, SECRET_B, actionsPerReveal),
					parseEther('5'),
					zeroAddress,
				],
			});

			await openRevealPhase();

			const revealA = () =>
				revealTurn(
					{env, Game},
					{
						account: playerA,
						identity: identityA,
						placements: placementsA,
						secret: SECRET_A,
						actionsPerReveal,
					},
				);
			const revealB = () =>
				revealTurn(
					{env, Game},
					{
						account: playerB,
						identity: identityB,
						placements: placementsB,
						secret: SECRET_B,
						actionsPerReveal,
					},
				);

			if (revealFirst === 'A') {
				await revealA();
				await revealB();
			} else {
				await revealB();
				await revealA();
			}

			const cell = (await env.read(Game, {
				functionName: 'getCell',
				args: [contested],
			})) as {totalStake: bigint; numClaimants: number};

			// The same zone as the client reads it. Sorted, because the ORDER of
			// this list is allowed to depend on arrival (see _place: the zone
			// index is appended to by whichever reveal claims a cell first) while
			// its CONTENT is not. Sorting is what separates the two, so this
			// assertion says what it means to.
			// All three cells are in zone 0, which spans -8..7 on both axes.
			const [listed] = (await env.read(Game, {
				functionName: 'getCellsInZone',
				args: [0n],
			})) as [
				{cellID: bigint; totalStake: bigint; numClaimants: number}[],
				bigint,
			];

			return {
				contested: cell,
				listed: listed
					.map((c) => `${c.cellID}:${c.totalStake}:${c.numClaimants}`)
					.sort(),
			};
		}

		for (const policy of [
			CYCLE_POLICY.Timed,
			CYCLE_POLICY.Manual,
			CYCLE_POLICY.TimedWithEarlyAdvance,
		] as CyclePolicy[]) {
			const aFirst = await boardAfterRevealsInOrder('A', policy);
			const bFirst = await boardAfterRevealsInOrder('B', policy);

			// Same final board either way: the cell is shared, not won.
			expect(aFirst.contested.totalStake).toEqual(bFirst.contested.totalStake);
			expect(aFirst.contested.numClaimants).toEqual(
				bFirst.contested.numClaimants,
			);

			// And it really is shared, rather than both reveals failing.
			expect(aFirst.contested.numClaimants).toEqual(2);
			expect(aFirst.contested.totalStake).toEqual(parseEther('2'));

			// The board a client READS is the same board too. This is a separate
			// claim from the one above: the cells are listed out of a per-zone
			// index that reveals append to, so an index that indexed only what
			// the first reveal saw, or that indexed a cell twice, would leave
			// the stakes identical and still show two different boards.
			expect(aFirst.listed).toEqual(bFirst.listed);
			expect(aFirst.listed.length).toEqual(3);
		}
	});

	it('counts one member however many times they top up', async function () {
		const fixtures = await networkHelpers.loadFixture(deployAll);
		const {env, Game, GameToken, unnamedAccounts} = fixtures;
		const player = unnamedAccounts[0];

		// FOUND BY MUTATION, and it is here rather than beside the cycle
		// policies because it is about THIS game's way in: a funded reserve is
		// what makes an account a member, and topping one up is an ordinary
		// thing to do twice. Counting the same member again raises the
		// denominator above the number of people who can ever answer it, so
		// unanimity becomes unreachable, a game with no clock stops advancing
		// for good, and the revert names a member who does not exist.
		await enterGame({env, Game, GameToken}, player);
		await enterGame({env, Game, GameToken}, player);

		const attendance = (await env.read(Game, {
			functionName: 'getAttendance',
		})) as {waitedFor: bigint};
		expect(attendance.waitedFor).toEqual(1n);
	});

	it('forfeits the bond of a player who never reveals', async function () {
		const {
			env,
			Game,
			GameToken,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			getCycleNumber,
			getTimestamp,
		} = await networkHelpers.loadFixture(deployAll);

		const player = unnamedAccounts[0];
		const {cycleNumber: startCycleNumber} = getCycleNumber(
			await getTimestamp(),
		);
		await advanceToCycleNumber(startCycleNumber + 2, true);

		const identity = await enterGame({env, Game, GameToken}, player);

		const placements: Placement[] = [{cellID: cellAt(1, 1)}];
		await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [
				identity,
				commitmentHashFor(placements, SECRET_A, actionsPerReveal),
				parseEther('4'),
				zeroAddress,
			],
		});

		// Let the cycle pass without revealing.
		const {cycleNumber} = getCycleNumber(await getTimestamp());
		await advanceToCycleNumber(cycleNumber + 1, true);

		// WITHOUT THE CHUNKS ONLY THE PLAYER MAY SETTLE: it takes the whole
		// bond, and a stranger could otherwise take a surplus the player could
		// have recovered by showing the chunks.
		await expect(
			env.execute(Game, {
				account: unnamedAccounts[1],
				functionName: 'forfeitMissedReveal',
				args: [identity],
			}),
		).toBeRejectedWith('NotDelegate');

		await env.execute(Game, {
			account: player,
			functionName: 'forfeitMissedReveal',
			args: [identity],
		});

		// The bond is gone; the rest of the reserve is untouched.
		expect(
			await env.read(Game, {functionName: 'getReserve', args: [identity]}),
		).toEqual(parseEther('6'));
	});

	it('settles a missed reveal shown its chunks, by anyone, taking only what was committed', async function () {
		// THE BOND IS A WHOLE NUMBER OF CHUNKS, as the client posts it, so it
		// does not say how many placements the turn holds. Shown the chunks, the
		// settlement establishes what was committed, forfeits what those
		// placements would have cost, and gives the rest back.
		const {
			env,
			Game,
			GameToken,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			getCycleNumber,
			getTimestamp,
		} = await networkHelpers.loadFixture(deployAll);

		const player = unnamedAccounts[0];
		const stranger = unnamedAccounts[1];
		const {cycleNumber: startCycleNumber} = getCycleNumber(
			await getTimestamp(),
		);
		await advanceToCycleNumber(startCycleNumber + 2, true);

		const identity = await enterGame({env, Game, GameToken}, player);
		const strangerIdentity = await enterGame(
			{env, Game, GameToken},
			stranger,
		);

		const turn: Placement[] = Array.from({length: 6}, (_, i) => ({
			cellID: cellAt(i, 3),
		}));
		const {head, chunks} = commitmentChain(turn, SECRET_A, actionsPerReveal);
		expect(chunks.length).toEqual(2);
		const wholeChunks = parseEther(String(chunks.length * actionsPerReveal));
		await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [identity, head, wholeChunks, zeroAddress],
		});

		const {cycleNumber} = getCycleNumber(await getTimestamp());

		// Not while the commitment's own cycle is in progress: that is a reveal.
		await expect(
			env.execute(Game, {
				account: stranger,
				functionName: 'acknowledgeMissedReveal',
				args: [identity, chunks[0].placements, SECRET_A, chunks[0].furtherActions],
			}),
		).toBeRejectedWith('CanStillReveal');

		await advanceToCycleNumber(cycleNumber + 1, true);

		const balanceBefore = (await env.read(GameToken, {
			functionName: 'balanceOf',
			args: [stranger],
		})) as bigint;

		// A chunk that is not the head is refused, exactly as a reveal would be.
		await expect(
			env.execute(Game, {
				account: stranger,
				functionName: 'acknowledgeMissedReveal',
				args: [identity, chunks[1].placements, SECRET_A, chunks[1].furtherActions],
			}),
		).toBeRejectedWith('CommitmentHashNotMatching');

		for (const chunk of chunks) {
			await env.execute(Game, {
				account: stranger,
				functionName: 'acknowledgeMissedReveal',
				args: [identity, chunk.placements, SECRET_A, chunk.furtherActions],
			});
		}

		// Six placements' worth is forfeited out of the eight bonded; the other
		// two are reserve again.
		expect(
			await env.read(Game, {functionName: 'getReserve', args: [identity]}),
		).toEqual(parseEther('4'));
		const settled = (await env.read(Game, {
			functionName: 'getCommitment',
			args: [identity],
		})) as {cycleNumber: bigint; bond: bigint};
		expect(settled.cycleNumber).toEqual(0n);
		expect(settled.bond).toEqual(0n);

		// NOTHING WENT TO WHOEVER SETTLED, in tokens or in reserve.
		expect(
			await env.read(GameToken, {functionName: 'balanceOf', args: [stranger]}),
		).toEqual(balanceBefore);
		expect(
			await env.read(Game, {
				functionName: 'getReserve',
				args: [strangerIdentity],
			}),
		).toEqual(parseEther('10'));

		// The placements were never applied: their cycle is over.
		const cell = (await env.read(Game, {
			functionName: 'getCell',
			args: [turn[0].cellID],
		})) as {totalStake: bigint};
		expect(cell.totalStake).toEqual(0n);

		// And the player is playing again.
		await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [
				identity,
				commitmentHashFor([{cellID: cellAt(0, 4)}], SECRET_B, actionsPerReveal),
				parseEther('1'),
				zeroAddress,
			],
		});
	});

	it('lets one address pay the stake and another play with it', async function () {
		// The split the whole client architecture depends on: a player's moves are
		// signed by a local key that holds no funds, while the stake is paid from
		// the wallet that does. Without this, a wallet prompt would be required for
		// every commit and every reveal, and an email/social account (which has no
		// wallet provider at all) could not play.
		const {
			env,
			Game,
			GameToken,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			advanceToRevealPhase,
			getCycleNumber,
			getTimestamp,
		} = await networkHelpers.loadFixture(deployAll);

		const payer = unnamedAccounts[0]; // the wallet, holds the money
		const player = unnamedAccounts[1]; // the signing key, holds nothing

		const {cycleNumber: startCycleNumber} = getCycleNumber(
			await getTimestamp(),
		);
		await advanceToCycleNumber(startCycleNumber + 2, true);

		const identity = await enterGame({env, Game, GameToken}, player, {
			payer,
		});

		expect(
			await env.read(Game, {functionName: 'getReserve', args: [identity]}),
		).toEqual(parseEther('10'));
		expect(
			await env.read(Game, {functionName: 'getReserve', args: [idOf(payer)]}),
		).toEqual(0n);

		// And the player, who never held a token, can now play on it.
		const placements: Placement[] = [{cellID: cellAt(5, 5)}];
		await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [
				identity,
				commitmentHashFor(placements, SECRET_A, actionsPerReveal),
				parseEther('1'),
				zeroAddress,
			],
		});

		const {cycleNumber} = getCycleNumber(await getTimestamp());
		await advanceToRevealPhase(cycleNumber, true);
		await revealTurn(
			{env, Game},
			{
				account: player,
				identity,
				placements,
				secret: SECRET_A,
				actionsPerReveal,
			},
		);

		const cell = (await env.read(Game, {
			functionName: 'getCell',
			args: [cellAt(5, 5)],
		})) as {totalStake: bigint; numClaimants: number};
		expect(cell.totalStake).toEqual(parseEther('1'));

		// Paid for out of the reserve the payer funded.
		expect(
			await env.read(Game, {functionName: 'getReserve', args: [identity]}),
		).toEqual(parseEther('9'));
	});

	it('lists placed cells in a zone', async function () {
		const {
			env,
			Game,
			GameToken,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			advanceToRevealPhase,
			getCycleNumber,
			getTimestamp,
		} = await networkHelpers.loadFixture(deployAll);

		const player = unnamedAccounts[0];
		const {cycleNumber: startCycleNumber} = getCycleNumber(
			await getTimestamp(),
		);
		await advanceToCycleNumber(startCycleNumber + 2, true);

		const identity = await enterGame({env, Game, GameToken}, player);

		// Two cells inside zone 0 (which spans -8..7 on both axes).
		const placements: Placement[] = [
			{cellID: cellAt(0, 0)},
			{cellID: cellAt(2, -3)},
		];
		await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [
				identity,
				commitmentHashFor(placements, SECRET_A, actionsPerReveal),
				parseEther('5'),
				zeroAddress,
			],
		});

		const {cycleNumber} = getCycleNumber(await getTimestamp());
		await advanceToRevealPhase(cycleNumber, true);
		await revealTurn(
			{env, Game},
			{
				account: player,
				identity,
				placements,
				secret: SECRET_A,
				actionsPerReveal,
			},
		);

		const [cells] = (await env.read(Game, {
			functionName: 'getCellsInZone',
			args: [0n],
		})) as [
			{cellID: bigint; totalStake: bigint; numClaimants: number}[],
			bigint,
		];

		expect(cells.length).toEqual(2);
		const ids = cells.map((c) => c.cellID).sort();
		expect(ids).toEqual([cellAt(0, 0), cellAt(2, -3)].sort());
	});
});

/**
 * A TURN MAY BE BIGGER THAN A TRANSACTION.
 *
 * Every chain has a gas ceiling, so a turn longer than that ceiling has to
 * arrive in pieces. The commitment is therefore the head of a HASH CHAIN: each
 * reveal opens one chunk and rewrites the head to the hash of the next, and the
 * commitment stays open until a chunk arrives declaring no further actions.
 *
 * The chunk is a MECHANISM and belongs to the framework, because every game on
 * this template needs it. It is not a cap on a TURN, which is a game rule, only
 * binds where identity is scarce, and is nobody's business here.
 *
 * Three things in here are load-bearing rather than tidy, and each has its own
 * test below because each fails silently and expensively:
 *
 * - a non-final chunk must be EXACTLY full, or a turn spreads over unbounded
 *   reveals;
 * - the cycle's tally counts TURNS and not transactions, or somebody else's
 *   advance strands the rest of a half-revealed turn;
 * - a half-revealed turn must still SETTLE, or the player is blocked forever.
 */
describe('a turn bigger than a transaction', function () {
	/** A row of cells, all in one zone, distinct from every other suite's. */
	function row(count: number, y: number): Placement[] {
		return Array.from({length: count}, (_, i) => ({cellID: cellAt(i, y)}));
	}

	/**
	 * The zone a cell is indexed under. Mirrors `PositionUtils.zoneCoord`.
	 *
	 * Written out rather than asked of the contract, and used rather than a zone
	 * id spelled as a literal: a literal that was wrong simply read an empty
	 * zone, so an assertion about the listing would have compared nothing with
	 * nothing and passed.
	 */
	function zoneOfCell(placement: Placement): bigint {
		const coord = (a: bigint) =>
			a >= 0n ? (a + 8n) / 16n : -((-a + 7n) / 16n);
		const x = BigInt.asIntN(32, placement.cellID & 0xffffffffn);
		const y = BigInt.asIntN(32, placement.cellID >> 32n);
		return (BigInt.asUintN(32, coord(y)) << 32n) + BigInt.asUintN(32, coord(x));
	}

	/** A game in its reveal phase, with one player in it and a turn committed. */
	async function committed(turn: Placement[], bond = parseEther('8')) {
		const fixtures = await networkHelpers.loadFixture(deployAll);
		const {
			env,
			Game,
			GameToken,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			advanceToRevealPhase,
			getCycleNumber,
			getTimestamp,
		} = fixtures;

		const player = unnamedAccounts[0];
		const {cycleNumber: startCycleNumber} = getCycleNumber(
			await getTimestamp(),
		);
		await advanceToCycleNumber(startCycleNumber + 2, true);

		const identity = await enterGame({env, Game, GameToken}, player);
		const {chunks} = commitmentChain(turn, SECRET_A, actionsPerReveal);

		await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [
				identity,
				commitmentHashFor(turn, SECRET_A, actionsPerReveal),
				bond,
				zeroAddress,
			],
		});

		const {cycleNumber} = getCycleNumber(await getTimestamp());
		await advanceToRevealPhase(cycleNumber, true);

		function revealChunk(index: number) {
			return env.execute(Game, {
				account: player,
				functionName: 'reveal',
				args: [
					identity,
					chunks[index].placements,
					SECRET_A,
					chunks[index].furtherActions,
					zeroAddress,
				],
			});
		}

		async function commitment() {
			return (await env.read(Game, {
				functionName: 'getCommitment',
				args: [identity],
			})) as {hash: `0x${string}`; cycleNumber: bigint; bond: bigint};
		}

		async function reserve(): Promise<bigint> {
			return (await env.read(Game, {
				functionName: 'getReserve',
				args: [identity],
			})) as bigint;
		}

		async function stakeOn(cellID: bigint): Promise<bigint> {
			const cell = (await env.read(Game, {
				functionName: 'getCell',
				args: [cellID],
			})) as {totalStake: bigint};
			return cell.totalStake;
		}

		return {
			...fixtures,
			player,
			identity,
			chunks,
			cycleNumber,
			revealChunk,
			commitment,
			reserve,
			stakeOn,
		};
	}

	it('reveals a turn across as many transactions as it takes', async function () {
		const turn = row(6, 20);
		const game = await committed(turn);

		// Six actions at four per reveal is two chunks, and the SECOND one is
		// short. Asserted rather than assumed, because a chunking that produced
		// one chunk would make everything below pass while testing nothing.
		expect(game.chunks.length).toEqual(2);
		expect(game.chunks[0].placements.length).toEqual(game.actionsPerReveal);
		expect(game.chunks[1].furtherActions).toEqual(NO_FURTHER_ACTIONS);

		await game.revealChunk(0);
		await game.revealChunk(1);

		for (const placement of turn) {
			expect(await game.stakeOn(placement.cellID)).toEqual(parseEther('1'));
		}
		// Every action paid for, and the surplus bond released.
		expect(await game.reserve()).toEqual(parseEther('4'));
		expect((await game.commitment()).cycleNumber).toEqual(0n);
		expect((await game.commitment()).bond).toEqual(0n);
	});

	it('advances the head and keeps the commitment open between chunks', async function () {
		const turn = row(6, 21);
		const game = await committed(turn);

		await game.revealChunk(0);

		const open = await game.commitment();
		// THE HEAD MOVED. This is what a client resumes from: which chunk is due
		// next is a fact on chain rather than something a browser remembers.
		expect(open.hash).toEqual(game.chunks[0].furtherActions);
		expect(open.cycleNumber).toEqual(BigInt(game.cycleNumber));
		// And the bond has fallen by what the chunk cost, so what stays earmarked
		// covers everything the turn has not yet opened. Eight was bonded and four
		// placements have landed.
		expect(open.bond).toEqual(parseEther('4'));

		// Half the turn is on the board; the other half is still hidden.
		expect(await game.stakeOn(turn[0].cellID)).toEqual(parseEther('1'));
		expect(await game.stakeOn(turn[5].cellID)).toEqual(0n);
	});

	it('refuses a chunk that promises more but is not full', async function () {
		// LOAD-BEARING. Without it a player dribbles one action per transaction
		// and spreads a turn across an unbounded number of reveals, which is a
		// denial of service on the reveal phase and on everyone else's reads.
		const game = await committed(row(6, 22));
		const {env, Game, player, identity, chunks} = game;

		await expect(
			env.execute(Game, {
				account: player,
				functionName: 'reveal',
				args: [
					identity,
					chunks[0].placements.slice(0, 1),
					SECRET_A,
					chunks[0].furtherActions,
					zeroAddress,
				],
				gas: 1000000n,
			}),
		).toBeRejectedWith(`custom error 'InvalidFurtherActions(`);

		// Nothing was applied, so the turn is exactly where it was.
		expect((await game.commitment()).hash).not.toEqual(
			chunks[0].furtherActions,
		);
	});

	it('refuses a chunk carrying more than one transaction may', async function () {
		// The rule the ported design does NOT have, and the reason to add it: the
		// chunk exists to make a reveal's worst case calculable, and a final chunk
		// allowed to be any length would give that back for the last transaction
		// of every single turn.
		const fixtures = await networkHelpers.loadFixture(deployAll);
		const {
			env,
			Game,
			GameToken,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			advanceToRevealPhase,
			getCycleNumber,
			getTimestamp,
		} = fixtures;

		const player = unnamedAccounts[0];
		const {cycleNumber: startCycleNumber} = getCycleNumber(
			await getTimestamp(),
		);
		await advanceToCycleNumber(startCycleNumber + 2, true);
		const identity = await enterGame({env, Game, GameToken}, player);

		// A turn hashed as ONE oversized chunk, which is what a client that had
		// not read the deployment's chunk size would build.
		const oversized = row(actionsPerReveal + 1, 23);
		const head = commitmentHashFor(oversized, SECRET_A, oversized.length);
		await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [identity, head, parseEther('8'), zeroAddress],
		});

		const {cycleNumber} = getCycleNumber(await getTimestamp());
		await advanceToRevealPhase(cycleNumber, true);

		await expect(
			env.execute(Game, {
				account: player,
				functionName: 'reveal',
				args: [identity, oversized, SECRET_A, NO_FURTHER_ACTIONS, zeroAddress],
				gas: 1000000n,
			}),
		).toBeRejectedWith(`custom error 'TooManyActions(`);
	});

	it('will not let the cycle close on a half-revealed turn', async function () {
		// THE TALLY COUNTS TURNS, NOT TRANSACTIONS. Counting a partial reveal
		// would let unanimity close the cycle while a player still owed chunks,
		// and those chunks would then be unrevealable: half a turn applied and the
		// rest lost, by somebody else's advance rather than by anything the player
		// did.
		const fixtures = await networkHelpers.loadFixture(deployAll);
		const {env, GameToken, unnamedAccounts} = fixtures;

		const Game = await deployGameWith(fixtures, {
			name: 'Game_chunked_advance',
			cyclePolicy: CYCLE_POLICY.Manual,
			commitPhaseDuration: 0n,
			revealPhaseDuration: 0n,
		});
		const actionsPerReveal = Number(DEFAULT_ACTIONS_PER_REVEAL);

		const player = unnamedAccounts[0];
		const identity = await enterGame({...fixtures, Game}, player);

		const turn = row(6, 24);
		const {chunks} = commitmentChain(turn, SECRET_A, actionsPerReveal);
		await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [
				identity,
				commitmentHashFor(turn, SECRET_A, actionsPerReveal),
				parseEther('8'),
				zeroAddress,
			],
		});
		// Everyone has committed, so the reveal phase may be opened.
		await env.execute(Game, {
			account: player,
			functionName: 'advanceCycle',
			args: [],
		});

		await env.execute(Game, {
			account: player,
			functionName: 'reveal',
			args: [
				identity,
				chunks[0].placements,
				SECRET_A,
				chunks[0].furtherActions,
				zeroAddress,
			],
		});

		await expect(
			env.execute(Game, {
				account: player,
				functionName: 'advanceCycle',
				args: [],
				gas: 1000000n,
			}),
		).toBeRejectedWith(`custom error 'StillWaitingToReveal(`);

		// The last chunk lands, and only now is the cycle over.
		await env.execute(Game, {
			account: player,
			functionName: 'reveal',
			args: [
				identity,
				chunks[1].placements,
				SECRET_A,
				chunks[1].furtherActions,
				zeroAddress,
			],
		});
		await env.execute(Game, {
			account: player,
			functionName: 'advanceCycle',
			args: [],
		});
	});

	it('lets the player settle a half-revealed turn in ONE call without its chunks, and frees the next cycle', async function () {
		// THE PART WITH A PLAYER'S STAKE IN IT. A commitment left open with its
		// head pointing at a chunk nobody will ever submit blocks every later
		// commitment that player makes, forever, and nothing else can resolve it.
		//
		// The player can always settle it WITHOUT the secret and without the
		// chunks, which is what makes it a settlement rather than a dependency on
		// the very thing that failed: what is left of the bond is forfeited, all
		// of it, because without the chunks the contract cannot tell the stake
		// from a surplus the bond may have been hiding the turn's length with.
		const turn = row(6, 25);
		const game = await committed(turn, parseEther('6'));
		const {
			env,
			Game,
			GameToken,
			player,
			identity,
			unnamedAccounts,
			advanceToCycleNumber,
			actionsPerReveal,
		} = game;

		await game.revealChunk(0);
		expect(await game.reserve()).toEqual(parseEther('6'));

		// The rest of the turn never arrives and the cycle passes.
		await advanceToCycleNumber(game.cycleNumber + 1, true);

		// ONE call, by the player, with nothing but the identity. Not by anybody:
		// a stranger may only settle shown the chunks.
		await expect(
			env.execute(Game, {
				account: unnamedAccounts[1],
				functionName: 'forfeitMissedReveal',
				args: [identity],
			}),
		).toBeRejectedWith('NotDelegate');
		await env.execute(Game, {
			account: player,
			functionName: 'forfeitMissedReveal',
			args: [identity],
		});

		const settled = await game.commitment();
		expect(settled.cycleNumber).toEqual(0n);
		expect(settled.bond).toEqual(0n);

		// ONLY WHAT WAS NEVER OPENED IS FORFEITED. Four placements landed and were
		// paid for; the two that did not are lost and bought nothing.
		expect(await game.reserve()).toEqual(parseEther('4'));
		expect(await game.stakeOn(turn[0].cellID)).toEqual(parseEther('1'));
		expect(await game.stakeOn(turn[5].cellID)).toEqual(0n);

		// AND THE PLAYER IS PLAYING AGAIN. Without this the settlement would have
		// been a formality: what it has to undo is the block on the next turn.
		const next = row(1, 26);
		await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [
				identity,
				commitmentHashFor(next, SECRET_B, actionsPerReveal),
				parseEther('1'),
				zeroAddress,
			],
		});
		expect((await game.commitment()).bond).toEqual(parseEther('1'));
		// Referenced so the fixture bag reads as used rather than half-unpacked.
		expect(typeof GameToken.address).toEqual('string');
	});

	it('reaches the same board however chunked reveals interleave', async function () {
		// The order-independence property, at the resolution chunking introduces:
		// two players now produce FOUR transactions, and the mempool may deliver
		// them interleaved. Nothing about the board may depend on that.
		async function boardAfter(
			order: 'blocked' | 'interleaved',
		): Promise<string[]> {
			const fixtures = await networkHelpers.loadFixture(deployAll);
			const {
				env,
				Game,
				GameToken,
				actionsPerReveal,
				unnamedAccounts,
				advanceToCycleNumber,
				advanceToRevealPhase,
				getCycleNumber,
				getTimestamp,
			} = fixtures;

			const playerA = unnamedAccounts[0];
			const playerB = unnamedAccounts[1];
			const {cycleNumber: startCycleNumber} = getCycleNumber(
				await getTimestamp(),
			);
			await advanceToCycleNumber(startCycleNumber + 2, true);

			const identityA = await enterGame({env, Game, GameToken}, playerA);
			const identityB = await enterGame({env, Game, GameToken}, playerB);

			// Overlapping turns, both longer than one transaction, so the shared
			// cells are claimed by different chunks of different turns.
			const turnA = row(6, 27);
			const turnB = [...row(3, 27), ...row(3, 28)];
			const chainA = commitmentChain(turnA, SECRET_A, actionsPerReveal);
			const chainB = commitmentChain(turnB, SECRET_B, actionsPerReveal);

			for (const [account, identity, head] of [
				[playerA, identityA, chainA.head],
				[playerB, identityB, chainB.head],
			] as const) {
				await env.execute(Game, {
					account,
					functionName: 'makeCommitment',
					args: [identity, head, parseEther('6'), zeroAddress],
				});
			}

			const {cycleNumber} = getCycleNumber(await getTimestamp());
			await advanceToRevealPhase(cycleNumber, true);

			const a = (i: number) =>
				env.execute(Game, {
					account: playerA,
					functionName: 'reveal',
					args: [
						identityA,
						chainA.chunks[i].placements,
						SECRET_A,
						chainA.chunks[i].furtherActions,
						zeroAddress,
					],
				});
			const b = (i: number) =>
				env.execute(Game, {
					account: playerB,
					functionName: 'reveal',
					args: [
						identityB,
						chainB.chunks[i].placements,
						SECRET_B,
						chainB.chunks[i].furtherActions,
						zeroAddress,
					],
				});

			if (order === 'blocked') {
				await a(0);
				await a(1);
				await b(0);
				await b(1);
			} else {
				await b(0);
				await a(0);
				await b(1);
				await a(1);
			}

			// Sorted, because the ORDER of a zone listing may depend on arrival and
			// its CONTENT may not. See the single-chunk version of this test above.
			const listings: string[] = [];
			for (const zone of new Set([...turnA, ...turnB].map(zoneOfCell))) {
				const [cells] = (await env.read(Game, {
					functionName: 'getCellsInZone',
					args: [zone],
				})) as [
					{cellID: bigint; totalStake: bigint; numClaimants: number}[],
					bigint,
				];
				for (const cell of cells) {
					listings.push(
						`${cell.cellID}:${cell.totalStake}:${cell.numClaimants}`,
					);
				}
			}
			return listings.sort();
		}

		const blocked = await boardAfter('blocked');
		const interleaved = await boardAfter('interleaved');

		expect(blocked).toEqual(interleaved);
		// And something actually happened: nine distinct cells, three of them
		// shared by both players.
		expect(blocked.length).toEqual(9);
		expect(blocked.filter((entry) => entry.endsWith(':2')).length).toEqual(3);
	});

	it('chunks to whatever the DEPLOYMENT says, not to a number in the code', async function () {
		// The parameter is what keeps a client and a contract agreeing about how a
		// turn is cut up, so this changes it and watches the rule follow. A test
		// that spelled the number out would go on passing while the deployment
		// said something else, which is the exact failure the parameter exists to
		// make impossible.
		const fixtures = await networkHelpers.loadFixture(deployAll);
		const {env, GameToken, unnamedAccounts} = fixtures;

		const Game = await deployGameWith(fixtures, {
			name: 'Game_chunk_of_two',
			cyclePolicy: CYCLE_POLICY.Manual,
			commitPhaseDuration: 0n,
			revealPhaseDuration: 0n,
			actionsPerReveal: 2n,
		});

		const config = (await env.read(Game, {functionName: 'getConfig'})) as {
			actionsPerReveal: bigint;
		};
		expect(config.actionsPerReveal).toEqual(2n);

		const player = unnamedAccounts[0];
		const identity = await enterGame({...fixtures, Game}, player);

		const turn = row(3, 29);
		// Cut for THIS game rather than for the shipped one: three actions at two
		// per reveal is two chunks, where at four per reveal it would be one.
		const {chunks} = commitmentChain(turn, SECRET_A, 2);
		expect(chunks.length).toEqual(2);

		await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [
				identity,
				commitmentHashFor(turn, SECRET_A, 2),
				parseEther('3'),
				zeroAddress,
			],
		});
		await env.execute(Game, {
			account: player,
			functionName: 'advanceCycle',
			args: [],
		});

		// A client that had kept the SHIPPED game's chunk size would build one
		// chunk of three and be refused here, after the stake was already bonded.
		await expect(
			env.execute(Game, {
				account: player,
				functionName: 'reveal',
				args: [identity, turn, SECRET_A, NO_FURTHER_ACTIONS, zeroAddress],
				gas: 1000000n,
			}),
		).toBeRejectedWith(`custom error 'TooManyActions(`);

		for (const chunk of chunks) {
			await env.execute(Game, {
				account: player,
				functionName: 'reveal',
				args: [
					identity,
					chunk.placements,
					SECRET_A,
					chunk.furtherActions,
					zeroAddress,
				],
			});
		}

		for (const placement of turn) {
			const cell = (await env.read(Game, {
				functionName: 'getCell',
				args: [placement.cellID],
			})) as {totalStake: bigint};
			expect(cell.totalStake).toEqual(parseEther('1'));
		}
		expect(typeof GameToken.address).toEqual('string');
	});

	it('refuses a deployment whose turns could never be revealed', async function () {
		// Same class as a zero phase duration and refused in the same place. A
		// chunk of zero makes every reveal revert, so every commitment is made and
		// none can be opened: the cost is the first player's stake rather than a
		// revert anybody reads.
		const fixtures = await networkHelpers.loadFixture(deployAll);

		await expect(
			deployGameWith(fixtures, {
				name: 'Game_chunk_of_none',
				cyclePolicy: CYCLE_POLICY.Timed,
				commitPhaseDuration: 30n,
				revealPhaseDuration: 10n,
				actionsPerReveal: 0n,
			}),
		).toBeRejected();
	});
});

/**
 * Playing without holding the stake.
 *
 * A player's moves are sent by a key their browser generated, which they never
 * see and which holds nothing. That key must be able to COMMIT, because a
 * wallet prompt twice a cycle is not a game, and it must not be able to take
 * the money, because it is one cleared site away from being gone and anything
 * that gets hold of it has whatever authority it was given.
 *
 * So the account is the player and the key merely acts for it. These tests pin
 * both halves: what the delegate may do, and what it may not.
 */
describe('Game delegation', function () {
	/** Stake `amount` for `player`, paid by `player`. */
	it('lets an authorised key commit for the account, bonding the ACCOUNT reserve', async function () {
		const {
			env,
			Game,
			GameToken,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			getCycleNumber,
			getTimestamp,
		} = await networkHelpers.loadFixture(deployAll);

		const account = unnamedAccounts[0];
		// Stands in for the browser's local signer: it holds no tokens and has no
		// reserve of its own, which is the whole point.
		const signer = unnamedAccounts[1];
		const {cycleNumber: startCycleNumber} = getCycleNumber(
			await getTimestamp(),
		);
		await advanceToCycleNumber(startCycleNumber + 2, true);

		const identity = await enterGame({env, Game, GameToken}, account);

		await env.execute(Game, {
			account,
			functionName: 'registerDelegate',
			args: [signer, zeroAddress],
		});
		// Asked about the PAIR, which is the only question there is: an account
		// may authorise several browsers, so there is no such thing as "the"
		// delegate to read back.
		expect(
			await env.read(Game, {
				functionName: 'delegationStatus',
				args: [account, signer],
			}),
		).toEqual([true, false]);

		const placements: Placement[] = [{cellID: cellAt(5, 6)}];
		await env.execute(Game, {
			// SENT BY the signer, FOR the account.
			account: signer,
			functionName: 'makeCommitment',
			args: [
				identity,
				commitmentHashFor(placements, SECRET_A, actionsPerReveal),
				parseEther('1'),
				zeroAddress,
			],
		});

		// The commitment is the ACCOUNT'S, not the sender's. If it were filed
		// under the signer, losing the browser would lose the submission, and the
		// bond would have come from a reserve the signer does not have.
		const commitment = (await env.read(Game, {
			functionName: 'getCommitment',
			args: [identity],
		})) as {hash: `0x${string}`; bond: bigint};
		expect(commitment.bond).toEqual(parseEther('1'));

		const signerCommitment = (await env.read(Game, {
			functionName: 'getCommitment',
			args: [idOf(signer)],
		})) as {hash: `0x${string}`; bond: bigint};
		expect(signerCommitment.bond).toEqual(0n);
	});

	it('refuses a key the account never authorised', async function () {
		const {
			env,
			Game,
			GameToken,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			getCycleNumber,
			getTimestamp,
		} = await networkHelpers.loadFixture(deployAll);

		const account = unnamedAccounts[0];
		const stranger = unnamedAccounts[2];
		const {cycleNumber: startCycleNumber} = getCycleNumber(
			await getTimestamp(),
		);
		await advanceToCycleNumber(startCycleNumber + 2, true);

		const identity = await enterGame({env, Game, GameToken}, account);

		// Without the check this succeeds, and that is the theft: a stranger bonds
		// someone else's reserve to a commitment only they know the secret for, so
		// it can never be revealed and the bond is simply lost.
		await expect(
			env.execute(Game, {
				account: stranger,
				functionName: 'makeCommitment',
				args: [
					identity,
					commitmentHashFor(
						[{cellID: cellAt(1, 1)}],
						SECRET_A,
						actionsPerReveal,
					),
					parseEther('1'),
					zeroAddress,
				],
			}),
		).toBeRejected();

		const commitment = (await env.read(Game, {
			functionName: 'getCommitment',
			args: [identity],
		})) as {bond: bigint};
		expect(commitment.bond).toEqual(0n);
	});

	it('reads a player of zero as the caller', async function () {
		// THE SHORTHAND, and it is this game's answer rather than the framework's.
		// `_playerOf` hands zero to the delegation library, which resolves it to
		// the sender - so a client with no delegate can commit for itself without
		// naming an identity at all. It is worth its own test because it is the
		// one behaviour a token game CANNOT have: there, zero is a token id, and
		// letting it mean "the caller" would make one identity behave unlike every
		// other one.
		const {
			env,
			Game,
			GameToken,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			getCycleNumber,
			getTimestamp,
		} = await networkHelpers.loadFixture(deployAll);

		const account = unnamedAccounts[0];
		const {cycleNumber: startCycleNumber} = getCycleNumber(
			await getTimestamp(),
		);
		await advanceToCycleNumber(startCycleNumber + 2, true);

		const identity = await enterGame({env, Game, GameToken}, account);

		await env.execute(Game, {
			account,
			functionName: 'makeCommitment',
			args: [
				0n,
				commitmentHashFor([{cellID: cellAt(9, 9)}], SECRET_A, actionsPerReveal),
				parseEther('1'),
				zeroAddress,
			],
		});

		const commitment = (await env.read(Game, {
			functionName: 'getCommitment',
			args: [identity],
		})) as {bond: bigint};
		expect(commitment.bond).toEqual(parseEther('1'));
	});

	it('refuses an identity this game cannot represent', async function () {
		// THE ALIASING GUARD, and it is the price of keying players by a `uint256`
		// rather than by an address.
		//
		// Every identity here is an account widened to 32 bytes, so the top 12
		// bytes are always zero. Nothing about the TYPE says so: a caller can pass
		// any 256-bit number, and without the check `_playerOf` would truncate it
		// to 20 bytes and hand back an account that somebody else owns. The pair
		// below is the cheapest instance of that - `account` and
		// `account + 2^160` - and they would share one reserve and one commitment
		// slot, with nothing raised anywhere.
		//
		// It is checked at the one place authority is granted, which is why a
		// reveal needs no such check: it opens a commitment that only a checked
		// call could ever have made.
		const {
			env,
			Game,
			GameToken,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			getCycleNumber,
			getTimestamp,
		} = await networkHelpers.loadFixture(deployAll);

		const account = unnamedAccounts[0];
		const {cycleNumber: startCycleNumber} = getCycleNumber(
			await getTimestamp(),
		);
		await advanceToCycleNumber(startCycleNumber + 2, true);

		const identity = await enterGame({env, Game, GameToken}, account);

		const aliased = idOf(account) + (1n << 160n);
		await expect(
			env.execute(Game, {
				account,
				functionName: 'makeCommitment',
				args: [
					aliased,
					commitmentHashFor(
						[{cellID: cellAt(2, 2)}],
						SECRET_A,
						actionsPerReveal,
					),
					parseEther('1'),
					zeroAddress,
				],
				gas: 1000000n,
			}),
		).toBeRejectedWith(`custom error 'InvalidPlayer(`);

		// And the account it would have aliased onto is untouched.
		const commitment = (await env.read(Game, {
			functionName: 'getCommitment',
			args: [identity],
		})) as {bond: bigint};
		expect(commitment.bond).toEqual(0n);
	});

	it('never lets the delegate withdraw the stake', async function () {
		// The line that makes a disposable key safe to hold. It may SPEND the
		// reserve on playing, which is what it is for, and it may not take it out.
		// `withdrawFromReserve` has no player argument at all, so the delegate can
		// only ever withdraw the reserve of the identity its own address spells,
		// which is empty.
		const {
			env,
			Game,
			GameToken,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			getCycleNumber,
			getTimestamp,
		} = await networkHelpers.loadFixture(deployAll);

		const account = unnamedAccounts[0];
		const signer = unnamedAccounts[1];
		const {cycleNumber: startCycleNumber} = getCycleNumber(
			await getTimestamp(),
		);
		await advanceToCycleNumber(startCycleNumber + 2, true);

		const identity = await enterGame({env, Game, GameToken}, account);
		await env.execute(Game, {
			account,
			functionName: 'registerDelegate',
			args: [signer, zeroAddress],
		});

		await expect(
			env.execute(Game, {
				account: signer,
				functionName: 'withdrawFromReserve',
				args: [parseEther('10')],
			}),
		).toBeRejected();

		expect(
			await env.read(Game, {functionName: 'getReserve', args: [identity]}),
		).toEqual(parseEther('10'));
	});

	it('routes every delegation selector on the proxy', async function () {
		// The router is where this breaks in practice: a route missing from the
		// deploy script, or two routes claiming one selector. Either way the
		// failure is a call that reverts with "function selector was not
		// recognized", which reads to a user as a broken wallet rather than as a
		// missing feature. Reading through the proxy is the only check that covers
		// the wiring as well as the code.
		//
		// All six of them, including the two writers, which are reached with a
		// call rather than a transaction: a selector that does not route reverts
		// on `eth_call` exactly as it would on a send, and this way the assertion
		// is about the wiring rather than about what registering does.
		const {env, Game, unnamedAccounts} =
			await networkHelpers.loadFixture(deployAll);
		const account = unnamedAccounts[0];

		expect(
			await env.read(Game, {
				functionName: 'delegationStatus',
				args: [account, account],
			}),
		).toEqual([false, false]);
		expect(
			typeof (await env.read(Game, {
				functionName: 'delegationMessage',
				args: [account, 0n],
			})),
		).toEqual('string');
		expect(
			typeof (await env.read(Game, {
				functionName: 'delegationDigest',
				args: [account, 0n],
			})),
		).toEqual('string');

		// The writers, sent for real. A selector that does not route reverts
		// before it reaches any code, so these landing at all is the assertion.
		const delegate = unnamedAccounts[1];
		await env.execute(Game, {
			account,
			functionName: 'registerDelegate',
			args: [delegate, zeroAddress],
		});
		await env.execute(Game, {
			account,
			functionName: 'revokeDelegate',
			args: [delegate],
		});
		expect(
			await env.read(Game, {
				functionName: 'delegationStatus',
				args: [account, delegate],
			}),
		).toEqual([false, true]);

		// The last one is reached by the error it gives back: rejecting the
		// signature means it got as far as the library, which is what routing
		// means here. A missing route would have said "function selector was not
		// recognized" instead.
		await expect(
			env.execute(Game, {
				account,
				functionName: 'registerDelegateViaSignature',
				args: [account, unnamedAccounts[2], 0n, `0x${'11'.repeat(65)}`],
				gas: 1000000n,
			}),
		).toBeRejectedWith(`custom error 'MalformedSignature()'`);
	});
});

/**
 * WHICH CONTRACT A SIGNATURE IS GOOD AT, when the contract is behind a router.
 *
 * The delegation message names the verifying contract, taken from
 * `address(this)`, and that bound is the whole point of the mechanism: a
 * credential minted for one game must not be submittable at another. This game
 * is deployed behind a PROXY, which the library upstream is not, so the answer
 * to "which address is that" is not something to reason about from how
 * `delegatecall` works. It is something to read off the deployed thing.
 *
 * If it were the route implementation rather than the proxy, every consequence
 * would be wrong at once: the client addresses the proxy, so it would build a
 * message for an address the contract never checks against; and re-deploying a
 * route would invalidate every signature already in existence.
 */
describe('Game delegation behind the router', function () {
	it('names the PROXY as the verifying contract, not the route', async function () {
		const {env, Game} = await networkHelpers.loadFixture(deployAll);
		const delegate = privateKeyToAccount(generatePrivateKey()).address;

		const message = (await env.read(Game, {
			functionName: 'delegationMessage',
			args: [delegate, 0n],
		})) as string;

		// The address the client talks to is the address inside the text.
		expect(message).toInclude(Game.address.toLowerCase());

		// And the route's own address is nowhere in it. Read from the deployment
		// rather than assumed, so this fails if the route stops being separate.
		const route = env.get('Game_Implementation_Router_Delegation_Route');
		expect(route.address.toLowerCase()).not.toEqual(Game.address.toLowerCase());
		expect(message).not.toInclude(route.address.toLowerCase());
	});

	it('accepts a signature built for the proxy, from the package builder', async function () {
		// The end of the chain the previous test starts: the client builds the
		// message in TypeScript for the address it addresses, the owner signs it
		// without ever sending anything, somebody else submits it, and the
		// registration lands. Nothing here reads the message off the contract, so
		// the two implementations are agreeing rather than being compared.
		const {env, Game, unnamedAccounts} =
			await networkHelpers.loadFixture(deployAll);

		const owner = privateKeyToAccount(generatePrivateKey());
		const delegate = privateKeyToAccount(generatePrivateKey());
		const payer = unnamedAccounts[0];
		const chainId = Number(
			BigInt((await provider.request({method: 'eth_chainId'})) as string),
		);

		const signature = await owner.signMessage({
			message: delegationMessage({
				delegate: delegate.address,
				contract: Game.address,
				chainId,
				deadline: 0,
			}),
		});

		await env.execute(Game, {
			account: payer,
			functionName: 'registerDelegateViaSignature',
			args: [owner.address, delegate.address, 0n, signature],
		});

		expect(
			await env.read(Game, {
				functionName: 'delegationStatus',
				args: [owner.address, delegate.address],
			}),
		).toEqual([true, false]);
	});

	it('refuses a signature naming the route implementation instead', async function () {
		// The negative half, and the one that would catch the bug quietly. A
		// signature for the wrong contract is well-formed, recovers to a real
		// address, and is simply somebody else's - so if the proxy ever started
		// verifying against the route, the test above would still pass while every
		// credential in the wild stopped working.
		const {env, Game, unnamedAccounts} =
			await networkHelpers.loadFixture(deployAll);

		const owner = privateKeyToAccount(generatePrivateKey());
		const delegate = privateKeyToAccount(generatePrivateKey());
		const route = env.get('Game_Implementation_Router_Delegation_Route');
		const chainId = Number(
			BigInt((await provider.request({method: 'eth_chainId'})) as string),
		);

		const signature = await owner.signMessage({
			message: delegationMessage({
				delegate: delegate.address,
				contract: route.address,
				chainId,
				deadline: 0,
			}),
		});

		await expect(
			env.execute(Game, {
				account: unnamedAccounts[0],
				functionName: 'registerDelegateViaSignature',
				args: [owner.address, delegate.address, 0n, signature],
				gas: 1000000n,
			}),
		).toBeRejectedWith(`custom error 'InvalidSignature()'`);
	});
});
