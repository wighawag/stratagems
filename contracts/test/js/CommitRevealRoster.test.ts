import {expect} from 'earl';
import {describe, it} from 'node:test'; // using node:test as hardhat v3 do not support vitest
import {network} from 'hardhat';
import {
	encodeAbiParameters,
	keccak256,
	parseEventLogs,
	zeroAddress,
	type Abi,
} from 'viem';
import {
	artifacts,
	loadAndExecuteDeploymentsFromFiles,
} from '../../rocketh/environment.js';

// SELF-CONTAINED ON PURPOSE, as `CommitRevealBase.test.ts` is: the base and
// this suite arrive in every game of the tree, whose `test/js/utils` are their
// own, so nothing here comes from `./utils`.

/**
 * A CLOSED ROSTER, ON THE BASE, UNDER A STUB GAME.
 *
 * What the base promises a game for a fixed set of members: a seat is taken by
 * funding a reserve while the game has not started and a seat is free; nobody
 * is waited for, so nobody commits and nothing advances, until the creator
 * starts it with two or more seated; the start re-anchors the clock so the
 * first cycle runs its full length; the creator may forfeit a member only in a
 * commit phase in which that member has not committed; and leaving after the
 * start is for good. A game that never opens a roster has open entry, which
 * `CommitRevealBase.test.ts` and `CyclePolicy.test.ts` pin unchanged.
 */

const {provider, networkHelpers} = await network.connect();

const NO_FURTHER_ACTIONS =
	'0x000000000000000000000000000000000000000000000000' as const;
const TIMED_WITH_EARLY_ADVANCE = 2;
const COMMIT_PHASE = 100;
const REVEAL_PHASE = 50;
const SECRET =
	'0x00000000000000000000000000000000000000000000000000000000000057b0';

type Order = {kind: number; quantity: bigint};

function idOf(account: `0x${string}`): bigint {
	return BigInt(account);
}

/** One chunk, in the one encoding, over the stub's action type. */
function commitmentOf(orders: Order[]): `0x${string}` {
	const encoded = encodeAbiParameters(
		[
			{type: 'bytes32'},
			{
				type: 'tuple[]',
				components: [
					{name: 'kind', type: 'uint8'},
					{name: 'quantity', type: 'uint64'},
				],
			},
			{type: 'bytes24'},
		],
		[SECRET, orders, NO_FURTHER_ACTIONS],
	);
	return keccak256(encoded).slice(0, 50) as `0x${string}`;
}

async function now(): Promise<number> {
	const block = (await provider.request({
		method: 'eth_getBlockByNumber',
		params: ['latest', false],
	})) as {timestamp: string};
	return Number(block.timestamp);
}

async function goTo(time: number) {
	await provider.request({method: 'evm_setNextBlockTimestamp', params: [time]});
	await provider.request({method: 'evm_mine'});
}

async function deployStub() {
	const env = await loadAndExecuteDeploymentsFromFiles({provider});
	const Stub = await env.deploy('CommitRevealRosterStubGame', {
		account: env.namedAccounts.deployer,
		artifact: artifacts.CommitRevealRosterStubGame,
		args: [
			{
				startTime: 0n,
				commitPhaseDuration: BigInt(COMMIT_PHASE),
				revealPhaseDuration: BigInt(REVEAL_PHASE),
				time: zeroAddress,
				actionsPerReveal: 2n,
				cyclePolicy: TIMED_WITH_EARLY_ADVANCE,
			},
		],
	});
	return {
		env,
		Stub,
		unnamedAccounts: env.unnamedAccounts as `0x${string}`[],
	};
}

type Cycle = {
	cycleNumber: bigint;
	commiting: boolean;
	phaseStart: bigint;
	phaseEnd: bigint;
};

/** A stub with a roster of `seats`, opened by `creator`. */
async function setup(seats = 3) {
	const fixtures = await networkHelpers.loadFixture(deployStub);
	const {env, Stub, unnamedAccounts} = fixtures;
	const [creator, alice, bob, carol, stranger] = unnamedAccounts;
	await env.execute(Stub, {
		account: creator,
		functionName: 'openRoster',
		args: [creator, seats],
	});

	const read = {
		roster: async () => {
			const [roster, members] = (await env.read(Stub, {
				functionName: 'getRoster',
			})) as [
				{creator: `0x${string}`; seats: number; started: boolean},
				bigint[],
			];
			return {...roster, members};
		},
		attendance: async () =>
			(await env.read(Stub, {functionName: 'getAttendance'})) as {
				waitedFor: bigint;
				committed: bigint;
				revealed: bigint;
			},
		cycle: async () =>
			(await env.read(Stub, {functionName: 'getCycle'})) as Cycle,
		reserve: async (account: `0x${string}`) =>
			(await env.read(Stub, {
				functionName: 'getReserve',
				args: [idOf(account)],
			})) as bigint,
	};

	const act = {
		join: (account: `0x${string}`, amount = 10n) =>
			env.execute(Stub, {
				account,
				functionName: 'deposit',
				args: [idOf(account), amount],
			}),
		withdraw: (account: `0x${string}`, amount: bigint) =>
			env.execute(Stub, {account, functionName: 'withdraw', args: [amount]}),
		start: (account: `0x${string}`) =>
			env.execute(Stub, {account, functionName: 'startGame'}),
		forfeit: (account: `0x${string}`, member: `0x${string}`) =>
			env.execute(Stub, {
				account,
				functionName: 'forfeitMember',
				args: [idOf(member)],
			}),
		commit: (account: `0x${string}`) =>
			env.execute(Stub, {
				account,
				functionName: 'makeCommitment',
				args: [idOf(account), commitmentOf([]), 0n],
			}),
		reveal: (account: `0x${string}`) =>
			env.execute(Stub, {
				account,
				functionName: 'reveal',
				args: [idOf(account), [], SECRET, NO_FURTHER_ACTIONS],
			}),
		advance: () =>
			env.execute(Stub, {account: stranger, functionName: 'advanceCycle'}),
	};

	return {
		...fixtures,
		creator,
		alice,
		bob,
		carol,
		stranger,
		read,
		act,
		events: (receipt: {logs: unknown[]}) =>
			parseEventLogs({
				abi: Stub.abi as Abi,
				logs: receipt.logs as Parameters<typeof parseEventLogs>[0]['logs'],
			}).map((log) => ({
				eventName: (log as unknown as {eventName: string}).eventName,
				args: (log as unknown as {args: Record<string, unknown>}).args,
			})),
	};
}

/** A three-seat game, its creator and two others seated, started. */
async function started() {
	const game = await setup(3);
	await game.act.join(game.creator);
	await game.act.join(game.alice);
	await game.act.join(game.bob);
	const receipt = await game.act.start(game.creator);
	return {...game, startReceipt: receipt};
}

describe('a closed roster on the commit-reveal base', function () {
	it('is opened once, with a creator and at least two seats', async function () {
		const fixtures = await networkHelpers.loadFixture(deployStub);
		const {env, Stub, unnamedAccounts} = fixtures;
		const [creator] = unnamedAccounts;
		await expect(
			env.execute(Stub, {
				account: creator,
				functionName: 'openRoster',
				args: [creator, 1],
			}),
		).toBeRejectedWith(/InvalidSeats/);
		await expect(
			env.execute(Stub, {
				account: creator,
				functionName: 'openRoster',
				args: [zeroAddress, 2],
			}),
		).toBeRejectedWith(/InvalidCreator/);

		const game = await setup(2);
		await expect(
			game.env.execute(game.Stub, {
				account: game.creator,
				functionName: 'openRoster',
				args: [game.creator, 2],
			}),
		).toBeRejectedWith(/RosterAlreadyOpened/);
	});

	it('cannot be opened on a game open entry already let somebody into', async function () {
		const fixtures = await networkHelpers.loadFixture(deployStub);
		const {env, Stub, unnamedAccounts} = fixtures;
		const [creator, alice] = unnamedAccounts;
		await env.execute(Stub, {
			account: alice,
			functionName: 'deposit',
			args: [idOf(alice), 10n],
		});
		await expect(
			env.execute(Stub, {
				account: creator,
				functionName: 'openRoster',
				args: [creator, 2],
			}),
		).toBeRejectedWith(/GameAlreadyStarted/);
	});

	it('seats whoever funds a reserve, and waits for nobody before the start', async function () {
		const game = await setup(2);
		await game.act.join(game.alice);
		const roster = await game.read.roster();
		expect(roster.creator.toLowerCase()).toEqual(game.creator.toLowerCase());
		expect(roster.seats).toEqual(2);
		expect(roster.started).toEqual(false);
		expect(roster.members).toEqual([idOf(game.alice)]);
		expect((await game.read.attendance()).waitedFor).toEqual(0n);

		// In a commit phase, so the refusal is about the roster.
		const cycle = await game.read.cycle();
		if (!cycle.commiting) {
			await goTo(Number(cycle.phaseEnd));
		}
		await expect(game.act.commit(game.alice)).toBeRejectedWith(/NotInGame/);
		await expect(game.act.advance()).toBeRejectedWith(/NoOneToWaitFor/);
	});

	it('refuses a seat when every seat is taken, and frees one when its member empties their reserve', async function () {
		const game = await setup(2);
		await game.act.join(game.alice);
		await game.act.join(game.bob);
		await expect(game.act.join(game.carol)).toBeRejectedWith(/GameFull/);

		await game.act.join(game.alice, 5n);
		expect(await game.read.reserve(game.alice)).toEqual(15n);

		await game.act.withdraw(game.alice, 15n);
		expect((await game.read.roster()).members).toEqual([idOf(game.bob)]);
		await game.act.join(game.carol);
		expect((await game.read.roster()).members).toEqual([
			idOf(game.bob),
			idOf(game.carol),
		]);
	});

	it('is started by its creator or a delegate of theirs, once two are seated', async function () {
		const game = await setup(3);
		await game.act.join(game.creator);
		await expect(game.act.start(game.creator)).toBeRejectedWith(
			/NotEnoughMembers/,
		);
		await game.act.join(game.alice);
		await expect(game.act.start(game.alice)).toBeRejectedWith(/NotDelegate/);

		await game.env.execute(game.Stub, {
			account: game.creator,
			functionName: 'registerDelegate',
			args: [game.stranger, zeroAddress],
		});
		await game.act.start(game.stranger);
		const roster = await game.read.roster();
		expect(roster.started).toEqual(true);
		expect((await game.read.attendance()).waitedFor).toEqual(2n);
		await expect(game.act.start(game.creator)).toBeRejectedWith(
			/GameAlreadyStarted/,
		);
	});

	it('re-anchors the clock at the start, so the first cycle runs its full length', async function () {
		const game = await setup(2);
		await game.act.join(game.creator);
		await game.act.join(game.alice);
		// Late in the deployment's commit phase: the grid would give the first
		// turn a few seconds.
		const before = await game.read.cycle();
		const cycleStart =
			Number(before.phaseStart) - (before.commiting ? 0 : COMMIT_PHASE);
		const late = cycleStart + (COMMIT_PHASE + REVEAL_PHASE) * 2 + 90;
		await goTo(late);
		const grid = await game.read.cycle();

		await provider.request({
			method: 'evm_setNextBlockTimestamp',
			params: [late + 5],
		});
		const receipt = await game.act.start(game.creator);
		const cycle = await game.read.cycle();
		expect(cycle.cycleNumber).toEqual(grid.cycleNumber + 1n);
		expect(cycle.commiting).toEqual(true);
		expect(cycle.phaseStart).toEqual(BigInt(late + 5));
		expect(cycle.phaseEnd).toEqual(BigInt(late + 5 + COMMIT_PHASE));

		const events = game.events(receipt);
		expect(events.map((e) => e.eventName)).toEqual([
			'WaitedForChanged',
			'WaitedForChanged',
			'GameStarted',
			'CycleAdvanced',
		]);
		expect(events[3].args.cycleNumber).toEqual(cycle.cycleNumber);
		expect(events[3].args.commiting).toEqual(true);
		expect(String(events[3].args.pushedBy).toLowerCase()).toEqual(
			game.creator.toLowerCase(),
		);
	});

	it('refuses a seat after the start, and lets a seated member top up', async function () {
		const game = await started();
		await expect(game.act.join(game.carol)).toBeRejectedWith(
			/GameAlreadyStarted/,
		);
		await game.act.join(game.alice, 5n);
		expect(await game.read.reserve(game.alice)).toEqual(15n);
	});

	it('plays a cycle advanced early, and one advanced by the clock', async function () {
		const game = await started();
		const first = await game.read.cycle();

		// Everyone acts: the reveal phase opens at once, the next cycle once
		// all have revealed.
		for (const member of [game.creator, game.alice, game.bob]) {
			await game.act.commit(member);
		}
		await game.act.advance();
		expect((await game.read.cycle()).commiting).toEqual(false);
		for (const member of [game.creator, game.alice, game.bob]) {
			await game.act.reveal(member);
		}
		await game.act.advance();
		const second = await game.read.cycle();
		expect(second.cycleNumber).toEqual(first.cycleNumber + 1n);
		expect(second.commiting).toEqual(true);
		expect(second.phaseStart < first.phaseEnd).toEqual(true);

		// Bob is absent: nothing advances early, the clock still does.
		await game.act.commit(game.creator);
		await game.act.commit(game.alice);
		await expect(game.act.advance()).toBeRejectedWith(/StillWaitingToCommit/);
		await goTo(Number(second.phaseStart) + COMMIT_PHASE + REVEAL_PHASE);
		const third = await game.read.cycle();
		expect(third.cycleNumber).toEqual(second.cycleNumber + 1n);
		expect(third.commiting).toEqual(true);
	});

	it('lets the creator forfeit a member who has not committed in this commit phase, and only then', async function () {
		const game = await started();
		await expect(game.act.forfeit(game.alice, game.bob)).toBeRejectedWith(
			/NotDelegate/,
		);
		await expect(game.act.forfeit(game.creator, game.carol)).toBeRejectedWith(
			/NotInGame/,
		);

		await game.act.commit(game.creator);
		await game.act.commit(game.alice);
		await expect(game.act.forfeit(game.creator, game.alice)).toBeRejectedWith(
			/MemberHasActed/,
		);

		const receipt = await game.act.forfeit(game.creator, game.bob);
		expect(game.events(receipt).map((e) => e.eventName)).toEqual([
			'SeatReleased',
			'WaitedForChanged',
			'MemberForfeited',
		]);
		expect((await game.read.attendance()).waitedFor).toEqual(2n);
		expect((await game.read.roster()).members).toEqual([
			idOf(game.creator),
			idOf(game.alice),
		]);
		// Everyone left has committed, so the reveal phase opens at once.
		await game.act.advance();
		expect((await game.read.cycle()).commiting).toEqual(false);

		// In a reveal phase nobody is forfeited: it waits for the commitments.
		await expect(game.act.forfeit(game.creator, game.alice)).toBeRejectedWith(
			/InRevealPhase/,
		);

		// Final: a forfeited member does not come back.
		await expect(game.act.join(game.bob)).toBeRejectedWith(
			/GameAlreadyStarted/,
		);
		expect(await game.read.reserve(game.bob)).toEqual(10n);
	});

	it('forfeits a member whose last commitment was never revealed, and settles nothing', async function () {
		const game = await started();
		const first = await game.read.cycle();
		for (const member of [game.creator, game.alice, game.bob]) {
			await game.act.commit(member);
		}
		await game.act.advance();
		await game.act.reveal(game.creator);
		await game.act.reveal(game.alice);
		// Bob never reveals; the clock closes the cycle.
		await goTo(Number(first.phaseStart) + COMMIT_PHASE + REVEAL_PHASE);

		await game.act.forfeit(game.creator, game.bob);
		const commitment = (await game.env.read(game.Stub, {
			functionName: 'getCommitment',
			args: [idOf(game.bob)],
		})) as {cycleNumber: bigint};
		expect(commitment.cycleNumber).toEqual(first.cycleNumber);
		expect(await game.read.reserve(game.bob)).toEqual(10n);
	});

	it('makes leaving after the start final', async function () {
		const game = await started();
		await game.act.withdraw(game.bob, 10n);
		expect((await game.read.attendance()).waitedFor).toEqual(2n);
		await expect(game.act.join(game.bob)).toBeRejectedWith(
			/GameAlreadyStarted/,
		);
	});

	it('refuses the roster routes on a game with open entry', async function () {
		const fixtures = await networkHelpers.loadFixture(deployStub);
		const {env, Stub, unnamedAccounts} = fixtures;
		const [creator, alice] = unnamedAccounts;
		await env.execute(Stub, {
			account: alice,
			functionName: 'deposit',
			args: [idOf(alice), 10n],
		});
		await expect(
			env.execute(Stub, {account: creator, functionName: 'startGame'}),
		).toBeRejectedWith(/NoRoster/);
		await expect(
			env.execute(Stub, {
				account: creator,
				functionName: 'forfeitMember',
				args: [idOf(alice)],
			}),
		).toBeRejectedWith(/NoRoster/);
	});
});
