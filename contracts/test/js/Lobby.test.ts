import {expect} from 'earl';
import {describe, it} from 'node:test'; // using node:test as hardhat v3 do not support vitest
import {network} from 'hardhat';
import {parseEventLogs, type Abi} from 'viem';
import {
	commitmentHashFor,
	enterGame,
	idOf,
	revealTurn,
	setupFixtures,
	TURN_BOND,
	CYCLE_POLICY,
	type Placement,
} from './utils/index.js';

/**
 * GAMES FOR A FIXED SET OF PLAYERS: the factory, the reference game's lobby
 * implementation, and one table played from its creation to a forfeit.
 *
 * The roster's rules are pinned on the base by `CommitRevealRoster.test.ts`;
 * this pins that the reference game's deployment carries them: a table is an
 * address of its own, cloned from the lobby implementation, with the lobby's
 * config (`TimedWithEarlyAdvance`), its own board and its own roster, and the
 * persistent world beside it keeps open entry.
 */

const {provider, networkHelpers} = await network.connect();
const {deployAll} = setupFixtures(provider);

const SECRET =
	'0x00000000000000000000000000000000000000000000000000000000000ab0b1';
/** How many cycles a table plays when a test does not say: more than any test reaches. */
const CYCLES = 100;
const NO_OPTIONS =
	'0x0000000000000000000000000000000000000000000000000000000000000000' as const;

type Cycle = {
	cycleNumber: bigint;
	commiting: boolean;
	phaseStart: bigint;
	phaseEnd: bigint;
};

async function createTable(
	seats: number,
	cycles = CYCLES,
	gameOptions: `0x${string}` = NO_OPTIONS,
) {
	const fixtures = await networkHelpers.loadFixture(deployAll);
	const {env} = fixtures;
	const [creator, alice, bob, carol] =
		fixtures.unnamedAccounts as `0x${string}`[];
	const Factory = env.get<Abi>('GameFactory');
	const Implementation = env.get<Abi>('GameLobbyImplementation');

	const receipt = await env.execute(Factory, {
		account: creator,
		functionName: 'createGame',
		args: [seats, cycles, gameOptions],
	});
	const [created] = parseEventLogs({
		abi: Factory.abi,
		logs: receipt.logs as Parameters<typeof parseEventLogs>[0]['logs'],
		eventName: 'GameCreated',
	}) as unknown as {
		args: {
			game: `0x${string}`;
			creator: string;
			seats: number;
			cycles: number;
			gameOptions: string;
		};
	}[];
	const Table = {address: created.args.game, abi: Implementation.abi};

	const tableFixtures = {...fixtures, Game: Table};
	const read = {
		cycle: async () =>
			(await env.read(Table, {functionName: 'getCycle'})) as Cycle,
		attendance: async () =>
			(await env.read(Table, {functionName: 'getAttendance'})) as {
				waitedFor: bigint;
				committed: bigint;
				revealed: bigint;
			},
		roster: async () =>
			(await env.read(Table, {functionName: 'getRoster'})) as [
				{
					creator: string;
					seats: number;
					started: boolean;
					cycles: number;
					startedWith: number;
				},
				bigint[],
			],
		end: async () => {
			const [cycleNumber, lastCycleNumber, ended] = (await env.read(Table, {
				functionName: 'getEnd',
			})) as [bigint, bigint, boolean];
			return {cycleNumber, lastCycleNumber, ended};
		},
		cell: async (cellID: bigint) =>
			(await env.read(Table, {functionName: 'getCell', args: [cellID]})) as {
				totalStake: bigint;
				numClaimants: number;
			},
	};

	async function commit(account: `0x${string}`, placements: Placement[]) {
		await env.execute(Table, {
			account,
			functionName: 'makeCommitment',
			args: [
				idOf(account),
				commitmentHashFor(placements, SECRET, fixtures.actionsPerReveal),
				TURN_BOND,
				'0x0000000000000000000000000000000000000000',
			],
		});
	}

	async function reveal(account: `0x${string}`, placements: Placement[]) {
		await revealTurn(tableFixtures, {
			account,
			identity: idOf(account),
			placements,
			secret: SECRET,
			actionsPerReveal: fixtures.actionsPerReveal,
		});
	}

	function advance() {
		return env.execute(Table, {account: carol, functionName: 'advanceCycle'});
	}

	return {
		...fixtures,
		Factory,
		Table,
		created,
		tableFixtures,
		creator,
		alice,
		bob,
		carol,
		read,
		commit,
		reveal,
		advance,
		join: (account: `0x${string}`) => enterGame(tableFixtures, account),
		start: (account: `0x${string}`) =>
			env.execute(Table, {account, functionName: 'start'}),
		forfeit: (member: `0x${string}`) =>
			env.execute(Table, {
				account: creator,
				functionName: 'forfeitMember',
				args: [idOf(member)],
			}),
	};
}

describe('games for a fixed set of players', function () {
	it('creates a table as an address of its own, with the lobby config, listed by the factory', async function () {
		const table = await createTable(3);
		expect(table.created.args.creator.toLowerCase()).toEqual(
			table.creator.toLowerCase(),
		);
		expect(table.created.args.seats).toEqual(3);
		expect(table.Table.address).not.toEqual(table.Game.address);

		const games = (await table.env.read(table.Factory, {
			functionName: 'getGames',
			args: [0n, 10n],
		})) as string[];
		expect(games).toEqual([table.Table.address]);

		const config = (await table.env.read(table.Table, {
			functionName: 'getConfig',
		})) as {cyclePolicy: number};
		expect(config.cyclePolicy).toEqual(CYCLE_POLICY.TimedWithEarlyAdvance);

		const [roster, members] = await table.read.roster();
		expect(roster.started).toEqual(false);
		expect(roster.seats).toEqual(3);
		expect(members).toEqual([]);

		// The table's roster cannot be opened a second time, by anyone.
		await expect(
			table.env.execute(table.Table, {
				account: table.alice,
				functionName: 'initializeLobby',
				args: [table.alice, 2, CYCLES, NO_OPTIONS],
			}),
		).toBeRejectedWith(/RosterAlreadyOpened/);
	});

	it("seats a player who buys a stake at the table through the world's sale", async function () {
		const table = await createTable(2);
		const price = BigInt((table.StakeSale.linkedData as {price: string}).price);
		await table.env.execute(table.StakeSale, {
			account: table.alice,
			functionName: 'purchaseAt',
			args: [
				table.Table.address,
				table.alice,
				'0x0000000000000000000000000000000000000000',
				0n,
			],
			value: price,
		});
		const [, members] = await table.read.roster();
		expect(members).toEqual([idOf(table.alice)]);
		const worldReserve = (await table.env.read(table.Game, {
			functionName: 'getReserve',
			args: [idOf(table.alice)],
		})) as bigint;
		expect(worldReserve).toEqual(0n);
	});

	it('leaves the persistent world with open entry and no lobby route', async function () {
		const table = await createTable(2);
		await table.join(table.alice);
		const WorldAsTable = {address: table.Game.address, abi: table.Table.abi};
		await expect(
			table.env.read(WorldAsTable, {functionName: 'getRoster'}),
		).toBeRejected();
		await expect(
			table.env.execute(WorldAsTable, {
				account: table.alice,
				functionName: 'initializeLobby',
				args: [table.alice, 2, CYCLES, NO_OPTIONS],
			}),
		).toBeRejected();
		// A member of the world is a member at once: no start.
		await enterGame(table, table.bob);
		const attendance = (await table.env.read(table.Game, {
			functionName: 'getAttendance',
		})) as {waitedFor: bigint};
		expect(attendance.waitedFor).toEqual(1n);
		// The table's seat is its own: the world's stake seated nobody there.
		const [, members] = await table.read.roster();
		expect(members).toEqual([idOf(table.alice)]);
	});

	it('plays a three-seat table from its creation to a forfeit: a cycle advanced early, one by the clock', async function () {
		const table = await createTable(3);
		await table.join(table.creator);
		await expect(table.start(table.creator)).toBeRejectedWith(
			/NotEnoughMembers/,
		);
		await table.join(table.alice);
		// In the deployment's commit phase, so the refusal is about the roster.
		const grid = await table.read.cycle();
		if (!grid.commiting) {
			await table.advanceToTime(Number(grid.phaseEnd), true);
		}
		await expect(table.commit(table.alice, [])).toBeRejectedWith(/NotInGame/);
		await table.join(table.bob);
		await expect(table.join(table.carol)).toBeRejectedWith(/GameFull/);
		await expect(table.start(table.alice)).toBeRejectedWith(/NotDelegate/);
		await table.start(table.creator);
		await expect(table.join(table.carol)).toBeRejectedWith(
			/GameAlreadyStarted/,
		);
		expect((await table.read.attendance()).waitedFor).toEqual(3n);

		// Cycle one: everyone acts, and both phases close early.
		const first = await table.read.cycle();
		expect(first.commiting).toEqual(true);
		const turns: [`0x${string}`, Placement[]][] = [
			[table.creator, [{cellID: 1n}]],
			[table.alice, [{cellID: 1n}, {cellID: 2n}]],
			[table.bob, [{cellID: 3n}]],
		];
		for (const [account, placements] of turns) {
			await table.commit(account, placements);
		}
		await table.advance();
		const revealing = await table.read.cycle();
		expect(revealing.commiting).toEqual(false);
		expect(revealing.phaseEnd).toEqual(first.phaseEnd + 15n);
		for (const [account, placements] of turns) {
			await table.reveal(account, placements);
		}
		await table.advance();
		const second = await table.read.cycle();
		expect(second.cycleNumber).toEqual(first.cycleNumber + 1n);
		expect(second.commiting).toEqual(true);
		expect((await table.read.cell(1n)).numClaimants).toEqual(2);
		// The world's board is not the table's.
		const worldCell = (await table.env.read(table.Game, {
			functionName: 'getCell',
			args: [1n],
		})) as {numClaimants: number};
		expect(worldCell.numClaimants).toEqual(0);

		// Cycle two: Bob is gone. Nothing closes early; the clock does.
		await table.commit(table.creator, [{cellID: 4n}]);
		await table.commit(table.alice, []);
		await expect(table.advance()).toBeRejectedWith(/StillWaitingToCommit/);
		await table.advanceToTime(Number(second.phaseEnd), true);
		expect((await table.read.cycle()).commiting).toEqual(false);
		await table.reveal(table.creator, [{cellID: 4n}]);
		await table.reveal(table.alice, []);
		const revealEnd = (await table.read.cycle()).phaseEnd;
		await table.advanceToTime(Number(revealEnd), true);
		const third = await table.read.cycle();
		expect(third.cycleNumber).toEqual(second.cycleNumber + 1n);
		expect(third.commiting).toEqual(true);

		// Cycle three: the creator forfeits the member who vanished, and the
		// two left close the cycle early again.
		await table.commit(table.creator, []);
		await expect(table.forfeit(table.creator)).toBeRejectedWith(
			/MemberHasActed/,
		);
		await table.forfeit(table.bob);
		expect((await table.read.attendance()).waitedFor).toEqual(2n);
		await table.commit(table.alice, [{cellID: 5n}]);
		await table.advance();
		await table.reveal(table.creator, []);
		await table.reveal(table.alice, [{cellID: 5n}]);
		await table.advance();
		const fourth = await table.read.cycle();
		expect(fourth.cycleNumber).toEqual(third.cycleNumber + 1n);
		expect((await table.read.cell(5n)).numClaimants).toEqual(1);
		await expect(table.join(table.bob)).toBeRejectedWith(/GameAlreadyStarted/);
	});

	it('ends a table after the cycles its creator chose: the last reveals land, then no commit or advance, and a missed reveal is still settled', async function () {
		const options =
			'0x00000000000000000000000000000000000000000000000000000000000c0de5' as const;
		const table = await createTable(2, 2, options);
		expect(table.created.args.cycles).toEqual(2);
		expect(table.created.args.gameOptions).toEqual(options);
		expect(
			await table.env.read(table.Table, {functionName: 'getGameOptions'}),
		).toEqual(options);
		await table.join(table.creator);
		await table.join(table.alice);
		await table.start(table.creator);
		const [roster] = await table.read.roster();
		expect(roster.cycles).toEqual(2);
		expect(roster.startedWith).toEqual(2);

		// Cycle one of two, closed early.
		const first = await table.read.cycle();
		await table.commit(table.creator, [{cellID: 1n}]);
		await table.commit(table.alice, [{cellID: 2n}]);
		await table.advance();
		await table.reveal(table.creator, [{cellID: 1n}]);
		await table.reveal(table.alice, [{cellID: 2n}]);
		await table.advance();

		// The last cycle: Alice commits and never reveals.
		const last = await table.read.cycle();
		expect(last.cycleNumber).toEqual(first.cycleNumber + 1n);
		expect((await table.read.end()).lastCycleNumber).toEqual(last.cycleNumber);
		await table.commit(table.creator, [{cellID: 3n}]);
		await table.commit(table.alice, [{cellID: 4n}]);
		await table.advance();
		await table.reveal(table.creator, [{cellID: 3n}]);
		expect((await table.read.cell(3n)).numClaimants).toEqual(1);
		const revealEnd = (await table.read.cycle()).phaseEnd;
		await table.advanceToTime(Number(revealEnd), true);

		expect((await table.read.end()).ended).toEqual(true);
		expect(
			await table.env.read(table.Table, {functionName: 'hasEnded'}),
		).toEqual(true);
		await expect(table.commit(table.creator, [])).toBeRejectedWith(/GameEnded/);
		await expect(table.advance()).toBeRejectedWith(/GameEnded/);
		await table.env.execute(table.Table, {
			account: table.alice,
			functionName: 'forfeitMissedReveal',
			args: [idOf(table.alice)],
		});
		const commitment = (await table.env.read(table.Table, {
			functionName: 'getCommitment',
			args: [idOf(table.alice)],
		})) as {cycleNumber: bigint};
		expect(commitment.cycleNumber).toEqual(0n);
		// The persistent world beside it never ends.
		const WorldAsTable = {address: table.Game.address, abi: table.Table.abi};
		await expect(
			table.env.read(WorldAsTable, {functionName: 'hasEnded'}),
		).toBeRejected();
	});

	it("keeps a table's commit and worst reveal under the lobby's declared gas", async function () {
		const table = await createTable(2);
		await table.join(table.creator);
		await table.join(table.alice);
		const startReceipt = await table.start(table.creator);

		// The reveal's worst case, as `GasBudget.test.ts` builds it for the
		// world: a full chunk of first claims, each in a different zone.
		const cellAt = (x: number, y: number) =>
			(BigInt.asUintN(32, BigInt(y)) << 32n) + BigInt.asUintN(32, BigInt(x));
		const placements = Array.from({length: table.actionsPerReveal}, (_, i) => ({
			cellID: cellAt(i * 40, 100),
		}));
		const commitReceipt = await table.env.execute(table.Table, {
			account: table.creator,
			functionName: 'makeCommitment',
			args: [
				idOf(table.creator),
				commitmentHashFor(placements, SECRET, table.actionsPerReveal),
				TURN_BOND,
				'0x0000000000000000000000000000000000000000',
			],
		});
		await table.commit(table.alice, []);
		await table.advance();
		const revealReceipt = await table.env.execute(table.Table, {
			account: table.creator,
			functionName: 'reveal',
			args: [
				idOf(table.creator),
				placements,
				SECRET,
				'0x000000000000000000000000000000000000000000000000',
				'0x0000000000000000000000000000000000000000',
			],
		});

		const linkedData = table.Factory.linkedData as {
			commitGas: string;
			revealGas: string;
		};
		const startUsed = BigInt(startReceipt.gasUsed);
		const commitUsed = BigInt(commitReceipt.gasUsed);
		const revealUsed = BigInt(revealReceipt.gasUsed);
		console.log(
			`lobby gas: start ${startUsed} (two members), commit ${commitUsed}/${linkedData.commitGas}, reveal ${revealUsed}/${linkedData.revealGas}`,
		);
		expect(commitUsed < BigInt(linkedData.commitGas)).toEqual(true);
		expect(revealUsed < BigInt(linkedData.revealGas)).toEqual(true);
	});
});
