import {expect} from 'earl';
import {describe, it} from 'node:test'; // using node:test as hardhat v3 do not support vitest
import {network} from 'hardhat';
import {
	setupFixtures,
	enterGame,
	leaveGame,
	deployGameWith,
	cycleClock,
	CYCLE_POLICY,
	TURN_BOND,
	commitmentHashFor,
	revealTurn,
	DEFAULT_ACTIONS_PER_REVEAL,
	type CyclePolicy,
	type Placement,
} from './utils/index.js';
import {zeroAddress} from 'viem';

const {provider, networkHelpers} = await network.create();
const {deployAll} = setupFixtures(provider);

/** What the games deployed in this suite will accept in one reveal. */
const CHUNK = Number(DEFAULT_ACTIONS_PER_REVEAL);

function cellAt(x: number, y: number): bigint {
	const ux = BigInt.asUintN(32, BigInt(x));
	const uy = BigInt.asUintN(32, BigInt(y));
	return (uy << 32n) + ux;
}

const SECRET_A =
	'0x0000000000000000000000000000000000000000000000000000000000000a11';
const SECRET_B =
	'0x0000000000000000000000000000000000000000000000000000000000000b22';

const COMMIT_PHASE = 30n;
const REVEAL_PHASE = 10n;

type Cycle = {
	cycleNumber: bigint;
	commiting: boolean;
	phaseStart: bigint;
	phaseEnd: bigint;
};

/**
 * A game on the named policy, with `players` accounts already in it.
 *
 * Deployed rather than configured, because a cycle policy is fixed at
 * construction: it decides what the clock MEANS, and a game that could change
 * its answer mid-cycle would be a game whose players had committed under
 * different rules from the ones they are judged by.
 */
async function gameOn(policy: CyclePolicy, players = 2) {
	const fixtures = await networkHelpers.loadFixture(deployAll);
	const {env, unnamedAccounts} = fixtures;

	const manual = policy === CYCLE_POLICY.Manual;
	const commitPhaseDuration = manual ? 0n : COMMIT_PHASE;
	const revealPhaseDuration = manual ? 0n : REVEAL_PHASE;

	const Game = await deployGameWith(fixtures, {
		name: `Game_policy_${policy}`,
		cyclePolicy: policy,
		commitPhaseDuration,
		revealPhaseDuration,
	});

	const clock = cycleClock({
		startTime: 0,
		commitPhaseDuration: Number(commitPhaseDuration),
		revealPhaseDuration: Number(revealPhaseDuration),
	});

	const accounts = unnamedAccounts.slice(0, players) as `0x${string}`[];
	const identities: bigint[] = [];
	for (const account of accounts) {
		// THE WHOLE FIXTURE BAG, with the game to enter overriding the deployed
		// one. What entering costs and what an identity IS are the game's, and
		// they are the one thing `utils` exists to differ about between this
		// repo's branches: a suite that named the way in would be the file that
		// has to be rewritten on every branch instead of the one that already is.
		identities.push(await enterGame({...fixtures, Game}, account));
	}

	// START AT THE TOP OF A COMMIT PHASE, and do it AFTER the setup rather than
	// before it. The chain's clock is wall-clock here, so a suite that just
	// starts committing gets whatever phase the minute happens to be in: these
	// tests were flaky in exactly that way, reverting `InRevealPhase` on about
	// one run in four - and a quarter of a 40-second cycle is precisely the
	// reveal phase's share of it. Advancing before the setup would not do,
	// because every deploy and every stake mines a block and spends a second of
	// the window the test still needs.
	if (!manual) {
		const {cycleNumber} = clock.getCycleNumber(await fixtures.getTimestamp());
		await fixtures.advanceToTime(clock.cycleStartTime(cycleNumber + 2), true);
	}

	async function cycle(): Promise<Cycle> {
		return (await env.read(Game, {functionName: 'getCycle'})) as Cycle;
	}

	async function attendance(): Promise<{
		waitedFor: bigint;
		committed: bigint;
		revealed: bigint;
	}> {
		return (await env.read(Game, {functionName: 'getAttendance'})) as any;
	}

	function commit(
		i: number,
		placements: Placement[],
		secret: `0x${string}`,
		// An EMPTY turn bonds nothing, which is what an idle player's automatic
		// commit sends, and it is the case where a bond locks no reserve.
		bond: bigint = TURN_BOND,
	) {
		return env.execute(Game, {
			account: accounts[i],
			functionName: 'makeCommitment',
			args: [
				identities[i],
				commitmentHashFor(placements, secret, CHUNK),
				bond,
				zeroAddress,
			],
		});
	}

	/**
	 * Reveal a whole turn, however many transactions it takes.
	 *
	 * Every turn in this suite is one placement and so one chunk, which is the
	 * point: what these tests are about is the CYCLE, and the cycle's tally
	 * counts turns rather than transactions. Going through the shared helper is
	 * what keeps that true if one of them ever plans a longer turn.
	 */
	function reveal(i: number, placements: Placement[], secret: `0x${string}`) {
		return revealTurn(
			{env, Game},
			{
				account: accounts[i],
				identity: identities[i],
				placements,
				secret,
				actionsPerReveal: CHUNK,
			},
		);
	}

	function advance(by = 0) {
		return env.execute(Game, {
			account: accounts[by] ?? fixtures.namedAccounts.deployer,
			functionName: 'advanceCycle',
			args: [],
		});
	}

	/** Wait out the clock, where there is one. */
	async function waitForRevealPhase() {
		const {cycleNumber} = clock.getCycleNumber(await fixtures.getTimestamp());
		await fixtures.advanceToTime(clock.revealStartTime(cycleNumber), true);
	}

	return {
		...fixtures,
		Game,
		clock,
		accounts,
		identities,
		cycle,
		attendance,
		commit,
		reveal,
		advance,
		waitForRevealPhase,
	};
}

describe('Cycle policy', function () {
	it('refuses to be pushed when the clock is the only thing that decides', async function () {
		const game = await gameOn(CYCLE_POLICY.Timed);
		await game.commit(0, [{cellID: cellAt(1, 1)}], SECRET_A);
		await game.commit(1, [{cellID: cellAt(2, 1)}], SECRET_B);

		// Unanimous, and still refused: a purely timed cycle has nothing for a
		// transaction to do, so offering one would let a caller look like they
		// had moved something.
		await expect(game.advance()).toBeRejectedWith(/NextPhaseNotAllowed/);
	});

	it('will not advance a game nobody is waiting for', async function () {
		const game = await gameOn(CYCLE_POLICY.Manual, 1);

		// The one member leaves, so unanimity has no denominator. Without this
		// refusal a single caller could spin an empty game forward as fast as
		// they liked.
		await leaveGame(game, game.accounts[0], game.identities[0]);
		expect((await game.attendance()).waitedFor).toEqual(0n);

		await expect(game.advance()).toBeRejectedWith(/NoOneToWaitFor/);
	});

	it('refuses a turn from someone who never entered the game', async function () {
		const game = await gameOn(CYCLE_POLICY.TimedWithEarlyAdvance, 1);
		const stranger = game.unnamedAccounts[5] as `0x${string}`;

		// THE NUMERATOR AND THE DENOMINATOR MUST COUNT THE SAME SET. Nothing
		// else here stops a stranger committing: a bond of zero against a
		// reserve of zero passes every other check. If it were allowed, enough
		// throwaway addresses would push the committed count past the
		// membership, close the commit phase before a real player had acted,
		// reveal nothing, advance again, and repeat every block - for gas.
		await expect(
			game.env.execute(game.Game, {
				account: stranger,
				functionName: 'makeCommitment',
				args: [
					BigInt(stranger),
					commitmentHashFor([], SECRET_B, CHUNK),
					0n,
					zeroAddress,
				],
			}),
		).toBeRejectedWith(/NotInGame/);

		expect((await game.attendance()).committed).toEqual(0n);
	});

	it('will not let a player stop being waited for with a turn still open', async function () {
		const game = await gameOn(CYCLE_POLICY.Manual, 2);

		// An EMPTY turn, which bonds nothing - what an idle player's automatic
		// commit sends. A zero bond locks no reserve, so without a rule of its
		// own this player could empty their reserve, cease to be waited for,
		// and leave the cycle counting their commitment while no longer
		// counting them. One member would then satisfy unanimity for two and
		// close the commit phase on somebody who had not acted.
		// Rejected, and again the COUNTS are the assertion: this game refuses it
		// as a reserve that cannot be emptied, and a game whose stake is custody
		// of a token refuses the withdrawal itself. Both keep the denominator
		// from shrinking under a commitment that is still outstanding.
		await game.commit(0, [], SECRET_A, 0n);
		await expect(
			leaveGame(game, game.accounts[0], game.identities[0]),
		).toBeRejected();

		const attendance = await game.attendance();
		expect(attendance.waitedFor).toEqual(2n);
		expect(attendance.committed).toEqual(1n);
		await expect(game.advance()).toBeRejectedWith(/StillWaitingToCommit/);
	});

	it('forgets the tally when the cycle turns over', async function () {
		const game = await gameOn(CYCLE_POLICY.Manual, 1);

		await game.commit(0, [{cellID: cellAt(2, 2)}], SECRET_A);
		await game.advance();
		await game.reveal(0, [{cellID: cellAt(2, 2)}], SECRET_A);
		await game.advance();

		// A tally that survived the boundary would report last cycle's
		// commitment as this cycle's, so an advance would be allowed with
		// nobody having acted at all. Nothing else in this suite notices:
		// deleting the guard that scopes the tally to its own cycle used to
		// pass every test here.
		const attendance = await game.attendance();
		expect(attendance.committed).toEqual(0n);
		expect(attendance.revealed).toEqual(0n);
		await expect(game.advance()).toBeRejectedWith(/StillWaitingToCommit/);
	});

	it('moves on unanimity and never on a majority', async function () {
		const game = await gameOn(CYCLE_POLICY.Manual, 3);

		await game.commit(0, [{cellID: cellAt(1, 1)}], SECRET_A);
		await game.commit(1, [{cellID: cellAt(2, 1)}], SECRET_B);

		// Two of three is a majority and it is not enough. If it were, the two
		// fast players would have closed the phase on the third, which is the
		// order-independence failure one level up: whoever is quickest decides,
		// and committing bought nothing.
		await expect(game.advance()).toBeRejectedWith(/StillWaitingToCommit/);

		await game.commit(2, [{cellID: cellAt(3, 1)}], SECRET_A);
		await game.advance();
		expect((await game.cycle()).commiting).toEqual(false);
	});

	it('stops waiting for a member who leaves, which is what unblocks the cycle', async function () {
		const game = await gameOn(CYCLE_POLICY.Manual, 2);

		await game.commit(0, [{cellID: cellAt(1, 1)}], SECRET_A);
		await expect(game.advance()).toBeRejectedWith(/StillWaitingToCommit/);

		// The silent member takes their reserve out, which is this game's way of
		// leaving. It settles nothing and costs nothing beyond the departure;
		// what it does is remove them from the denominator, and that is the
		// whole of what stops an absent player freezing a game with no clock.
		await leaveGame(game, game.accounts[1], game.identities[1]);

		const attendance = await game.attendance();
		expect(attendance.waitedFor).toEqual(1n);
		expect(attendance.committed).toEqual(1n);

		await game.advance();
		expect((await game.cycle()).commiting).toEqual(false);
	});

	it('counts a replaced commitment once, not twice', async function () {
		const game = await gameOn(CYCLE_POLICY.Manual, 2);

		await game.commit(0, [{cellID: cellAt(1, 1)}], SECRET_A);
		await game.commit(0, [{cellID: cellAt(9, 9)}], SECRET_A);

		// One player changing their mind must not satisfy unanimity for two.
		expect((await game.attendance()).committed).toEqual(1n);
		await expect(game.advance()).toBeRejectedWith(/StillWaitingToCommit/);
	});

	it('gives back the vote of a player who cancels', async function () {
		const game = await gameOn(CYCLE_POLICY.Manual, 2);

		await game.commit(0, [{cellID: cellAt(1, 1)}], SECRET_A);
		await game.commit(1, [{cellID: cellAt(2, 1)}], SECRET_B);
		await game.env.execute(game.Game, {
			account: game.accounts[1],
			functionName: 'cancelCommitment',
			args: [game.identities[1]],
		});

		expect((await game.attendance()).committed).toEqual(1n);
		await expect(game.advance()).toBeRejectedWith(/StillWaitingToCommit/);
	});

	it('will not leave a cycle while one of its commitments is still open', async function () {
		const game = await gameOn(CYCLE_POLICY.Manual, 2);

		const placementsA = [{cellID: cellAt(1, 1)}];
		const placementsB = [{cellID: cellAt(2, 1)}];
		await game.commit(0, placementsA, SECRET_A);
		await game.commit(1, placementsB, SECRET_B);
		await game.advance();

		await game.reveal(0, placementsA, SECRET_A);

		// THE SAME ORDER-INDEPENDENCE RULE, ONE LEVEL UP. If this advanced, the
		// second player's reveal would land in a cycle that had moved on and
		// revert, so the ORDER of an advance against a reveal would decide what
		// a player got. Because the condition is read at execution time, a
		// reveal still in the mempool has not been counted and this refuses.
		await expect(game.advance()).toBeRejectedWith(/StillWaitingToReveal/);

		await game.reveal(1, placementsB, SECRET_B);
		const before = await game.cycle();
		await game.advance();
		const after = await game.cycle();
		expect(after.cycleNumber).toEqual(before.cycleNumber + 1n);
		expect(after.commiting).toEqual(true);
	});

	it('advances a manual cycle into the REVEAL phase, never past it', async function () {
		const game = await gameOn(CYCLE_POLICY.Manual, 1);

		const placements = [{cellID: cellAt(4, 4)}];
		const before = await game.cycle();
		await game.commit(0, placements, SECRET_A);
		await game.advance();
		const after = await game.cycle();

		// THE PROPERTY THE WHOLE CYCLE RESTS ON. A commitment made in the
		// current cycle must always still be openable, which is true exactly
		// while a cycle is a commit phase followed by a reveal phase and
		// nothing else. An advance out of a commit phase that skipped to the
		// next cycle would stran the commitment just made: unrevealable, and
		// forfeit, with nothing raised anywhere.
		expect(after.cycleNumber).toEqual(before.cycleNumber);
		expect(after.commiting).toEqual(false);

		await game.reveal(0, placements, SECRET_A);
	});

	it('opens the reveal phase early without moving the deadline', async function () {
		const game = await gameOn(CYCLE_POLICY.TimedWithEarlyAdvance, 2);

		const before = await game.cycle();
		expect(before.commiting).toEqual(true);

		await game.commit(0, [{cellID: cellAt(1, 1)}], SECRET_A);
		await game.commit(1, [{cellID: cellAt(2, 1)}], SECRET_B);
		await game.advance();

		const after = await game.cycle();
		expect(after.cycleNumber).toEqual(before.cycleNumber);
		expect(after.commiting).toEqual(false);

		// AN ADVANCE MAY ONLY WIDEN A WINDOW. The reveal window now runs from
		// the advance until the moment it always would have ended, so a reveal
		// scheduled against the nominal time still lands inside it. Moving the
		// deadline forward instead would lose exactly those reveals, silently,
		// at the cost of the stake.
		expect(after.phaseEnd).toEqual(before.phaseEnd + REVEAL_PHASE);

		// The window opened WHEN THE ADVANCE LANDED, inside the commit phase it
		// cut short. The load-bearing half is that it is NOT ZERO: asserting
		// only `phaseStart < before.phaseEnd` passes when nothing is written at
		// all, and zero is the value this type reserves for a game with no
		// clock - so a reveal window would report as unbounded rather than as
		// opened early. Not `>` the cycle's start, because several
		// transactions can share one second of chain time and then it is `==`.
		expect(after.phaseStart !== 0n).toEqual(true);
		expect(after.phaseStart >= before.phaseStart).toEqual(true);
		expect(after.phaseStart < before.phaseEnd).toEqual(true);
	});

	it('still accepts a reveal at the nominal time after an early open', async function () {
		const game = await gameOn(CYCLE_POLICY.TimedWithEarlyAdvance, 1);

		const placements = [{cellID: cellAt(5, 5)}];
		await game.commit(0, placements, SECRET_A);
		await game.advance();

		// What a scheduler handed a `revealDueAt` at commit time would do: turn
		// up at the nominal reveal time, long after the window opened early.
		const {cycleNumber} = game.clock.getCycleNumber(await game.getTimestamp());
		await game.advanceToTime(game.clock.revealStartTime(cycleNumber) + 1, true);
		await game.reveal(0, placements, SECRET_A);
	});

	it('runs the next cycle from the advance, which is what makes it faster', async function () {
		const game = await gameOn(CYCLE_POLICY.TimedWithEarlyAdvance, 1);

		const placements = [{cellID: cellAt(6, 6)}];
		const before = await game.cycle();
		await game.commit(0, placements, SECRET_A);
		await game.advance();
		await game.reveal(0, placements, SECRET_A);
		await game.advance();

		const after = await game.cycle();
		expect(after.cycleNumber).toEqual(before.cycleNumber + 1n);
		expect(after.commiting).toEqual(true);

		// The new commit phase is a FULL one starting now, rather than what was
		// left of a slot on the original grid. Without this an early advance
		// would buy nothing at all: the cycle would still turn over on the
		// clock, and "everyone is here, get on with it" would be unsayable.
		expect(after.phaseEnd - after.phaseStart).toEqual(COMMIT_PHASE);
		expect(after.phaseStart < before.phaseEnd).toEqual(true);
	});

	it('falls back to the clock when a member never commits', async function () {
		const game = await gameOn(CYCLE_POLICY.TimedWithEarlyAdvance, 2);

		const placements = [{cellID: cellAt(7, 7)}];
		await game.commit(0, placements, SECRET_A);
		await expect(game.advance()).toBeRejectedWith(/StillWaitingToCommit/);

		// Nobody is timed out by anybody: the clock is the protection, so a
		// silent member costs this game its early turnaround and nothing else.
		await game.waitForRevealPhase();
		expect((await game.cycle()).commiting).toEqual(false);
		await game.reveal(0, placements, SECRET_A);
	});

	it('never advances as a rider on the last reveal', async function () {
		const game = await gameOn(CYCLE_POLICY.TimedWithEarlyAdvance, 1);

		const placements = [{cellID: cellAt(8, 8)}];
		await game.commit(0, placements, SECRET_A);
		await game.advance();
		const before = await game.cycle();
		await game.reveal(0, placements, SECRET_A);
		const after = await game.cycle();

		// Revealing last is not a different function from revealing first. If
		// it were, a reveal's gas would depend on winning a race, an advance
		// stranded by an unrelated revert would leave the cycle stuck, and the
		// policy would have leaked into the one call every policy shares.
		expect(after.cycleNumber).toEqual(before.cycleNumber);
		expect(after.commiting).toEqual(false);
	});

	it('refuses a configuration with a phase that does not exist', async function () {
		const fixtures = await networkHelpers.loadFixture(deployAll);

		// A zero reveal phase makes every commitment unopenable and a zero
		// commit phase makes every commitment impossible, and both are silent:
		// the first player to lose their stake is the error message. Refused at
		// construction instead.
		await expect(
			deployGameWith(fixtures, {
				name: 'Game_no_reveal_phase',
				cyclePolicy: CYCLE_POLICY.Timed,
				commitPhaseDuration: 30n,
				revealPhaseDuration: 0n,
			}),
		).toBeRejected();

		// And a manual game has no clock, so a duration there describes a
		// schedule that does not exist - which a client would read back and
		// draw a countdown with.
		await expect(
			deployGameWith(fixtures, {
				name: 'Game_manual_with_a_clock',
				cyclePolicy: CYCLE_POLICY.Manual,
				commitPhaseDuration: 30n,
				revealPhaseDuration: 10n,
			}),
		).toBeRejected();
	});
});
