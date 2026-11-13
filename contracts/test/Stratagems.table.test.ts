/**
 * A TABLE: one stratagems game for a fixed set of players, at an address of its
 * own (step L2 of work/plans/join-template-commit-reveal.md). Its seats are
 * taken by staking, as the world's are, but a table has no global approval on
 * the tokens (the world's is granted per address by its deploy), so it is paid
 * by an ordinary allowance (PL2-1), as any ERC20 would need.
 */
import {expect, describe, it} from 'vitest';
import {maxUint256, parseEther, parseEventLogs, zeroAddress} from 'viem';
import type {Deployment} from 'rocketh/types';
import {prepareCommitment, randomSecret, xyToBigIntID} from 'stratagems-common';
import {fetchContract, getConnection, loadFixture, networkHelpers} from '../utils/connection.js';
import * as abis from '../generated/abis/index.js';
import {deployStratagemsWithTestConfig} from './utils/stratagems-test.js';

async function withTokens() {
	const env = await deployStratagemsWithTestConfig();
	const [player, puller] = env.otherAccounts;
	await env.TestTokens.write.transfer([player, parseEther('100')], {account: env.tokensBeneficiary});
	return {env, player, puller};
}

describe('the tokens, as a table meets them', function () {
	// A table pulls its stake with `transferFrom(player, table)` under the
	// player's allowance, and pays out with `transfer`. Any address that is not
	// the world stands in for it here: what the tokens refuse is decided by the
	// address, not by its code.
	it('take a second deposit into an address paid by allowance', async function () {
		const {env, player, puller} = await loadFixture(withTokens);
		await env.TestTokens.write.approve([puller, parseEther('10')], {account: player});
		await env.TestTokens.write.transferFrom([player, puller, parseEther('5')], {account: puller});
		await env.TestTokens.write.transferFrom([player, puller, parseEther('5')], {account: puller});
		expect(await env.TestTokens.read.balanceOf([puller])).to.equal(parseEther('10'));
	});

	it('let such an address pay out to a player who has been paid before', async function () {
		const {env, player, puller} = await loadFixture(withTokens);
		await env.TestTokens.write.approve([puller, parseEther('10')], {account: player});
		await env.TestTokens.write.transferFrom([player, puller, parseEther('10')], {account: puller});
		// the player was touched by the beneficiary's transfer in the fixture
		await env.TestTokens.write.transfer([player, parseEther('3')], {account: puller});
		expect(await env.TestTokens.read.balanceOf([puller])).to.equal(parseEther('7'));
	});
});

const STAKE = parseEther('32');
/** a table's options as stratagems reads them (L4-23): `{uint32 stakeGems; uint16 gapPercent}` */
export function tableOptions(stakeGems: number, gapPercent: number): `0x${string}` {
	return `0x${((BigInt(gapPercent) << 32n) | BigInt(stakeGems)).toString(16).padStart(64, '0')}`;
}
/** more cycles than the L2 story plays, so it never meets the end */
const MANY_CYCLES = 100;
/** what a one-move turn may spend: one gem */
const BOND = parseEther('1');

/** The world's deploy and its tables beside it, with four players holding gems. */
async function withATableOfThree() {
	const env = await deployStratagemsWithTestConfig();
	const {publicClient} = await getConnection();
	const {deployments} = env;
	const Factory = await fetchContract(deployments['StratagemsTableFactory'] as Deployment<typeof abis.CommitRevealGameFactory>);
	const implementation = deployments['StratagemsTableImplementation'];
	const noRewards = deployments['NoRewards'].address;

	const [creator, alice, bob, carol] = env.otherAccounts;
	for (const player of [creator, alice, bob, carol]) {
		await env.TestTokens.write.transfer([player, parseEther('100')], {account: env.tokensBeneficiary});
	}

	const creation = await Factory.write.createGame([3, MANY_CYCLES, tableOptions(32, 0)], {account: creator});
	const creationReceipt = await publicClient.waitForTransactionReceipt({hash: creation});
	const [created] = parseEventLogs({abi: Factory.abi, logs: creationReceipt.logs, eventName: 'GameCreated'});
	const Table = (await fetchContract({address: created.args.game, abi: implementation.abi as any})) as any;

	let lastApproval: `0x${string}` | undefined;
	async function takeSeat(player: `0x${string}`) {
		// PL2-1: an ordinary allowance for the amount staked, then the game's own stake
		lastApproval = await env.TestTokens.write.approve([Table.address, STAKE], {account: player});
		return Table.write.addToReserveAndFund([BigInt(player), STAKE, zeroAddress], {account: player});
	}

	return {
		env,
		Factory,
		Table,
		noRewards,
		creator,
		alice,
		bob,
		carol,
		creationGas: creationReceipt.gasUsed,
		createdIn: creationReceipt.blockNumber,
		implementationDeployedIn: BigInt(implementation.receipt!.blockNumber),
		takeSeat,
		lastApproval: () => lastApproval!,
	};
}

async function gasOf(hash: `0x${string}`) {
	const {publicClient} = await getConnection();
	return (await publicClient.waitForTransactionReceipt({hash})).gasUsed;
}

function turn(x: number, y: number, color: number) {
	return prepareCommitment([{position: xyToBigIntID(x, y), color}], randomSecret());
}

describe('a table', function () {
	it('is an address of its own, created by the factory with the table config and no rewards', async function () {
		const {env, Factory, Table, noRewards, creator, createdIn, implementationDeployedIn} =
			await loadFixture(withATableOfThree);
		expect(Table.address).not.toEqual(env.Stratagems.address);
		expect(await Factory.read.getGames([0n, 10n])).toEqual([Table.address]);

		const config = await Table.read.getConfig();
		expect(config.cyclePolicy).to.equal(2);
		expect(config.commitPhaseDuration).to.equal(45n);
		expect(config.revealPhaseDuration).to.equal(15n);
		expect(config.startTime).to.equal(1_735_689_600n);
		expect(config.generator.toLowerCase()).to.equal(noRewards.toLowerCase());
		expect(config.tokens.toLowerCase()).to.equal(env.TestTokens.address.toLowerCase());

		const [roster, members] = await Table.read.getRoster();
		expect(roster.creator.toLowerCase()).to.equal(creator.toLowerCase());
		expect(roster.seats).to.equal(3);
		expect(roster.started).to.equal(false);
		expect(members).toEqual([]);
		// where its history starts (step T2): the block it was created in, which
		// its record's start block is, and not the implementation's deployment
		expect(BigInt(roster.openedAtBlock)).to.equal(createdIn);
		expect(createdIn > implementationDeployedIn).to.equal(true);
		// the world keeps open entry: it has no lobby route at all
		expect((await env.TestTokens.read.globalApprovals([Table.address]))).to.equal(false);
	});

	it('is played from its creation to the creator forfeiting a vanished member, and earns nothing', async function () {
		const {env, Table, creator, alice, bob, carol, creationGas, takeSeat, lastApproval} =
			await loadFixture(withATableOfThree);
		const generatorBefore = await Promise.all(
			[creator, alice, bob].map((p) => env.GemsGenerator.read.balanceOf([p])),
		);
		const generatorSupplyBefore = await env.GemsGenerator.read.totalSupply();

		// seats are taken by staking, paid by allowance; a fourth is refused
		const firstStakeGas = await gasOf(await takeSeat(creator));
		const approvalGas = await gasOf(lastApproval());
		await takeSeat(alice);
		await takeSeat(bob);
		await expect(takeSeat(carol)).rejects.toThrow(/GameFull/);
		// a seat holds exactly the table's stake: a second deposit is refused (L4-23)
		await expect(takeSeat(alice)).rejects.toThrow(/TableStakeIsFixed/);
		expect(await Table.read.getReserve([BigInt(alice)])).to.equal(STAKE);

		// nobody plays before the start: a seated member is not waited for yet
		// (in a commit phase of the deployment's grid, so the phase is not the
		// reason)
		const grid = await Table.read.getCycle();
		if (!grid.commiting) {
			await networkHelpers.time.increaseTo(grid.phaseEnd);
		}
		const early = turn(0, 0, 1);
		await expect(
			Table.write.makeCommitment([BigInt(alice), early.hash, BOND, zeroAddress], {account: alice}),
		).rejects.toThrow(/NotInGame/);
		await expect(Table.write.start({account: alice})).rejects.toThrow();

		await Table.write.start({account: creator});
		const started = await Table.read.getCycle();
		expect(started.commiting).to.equal(true);
		expect(started.phaseEnd - started.phaseStart).to.equal(45n);

		// CYCLE ONE, ADVANCED EARLY: everyone acts, nobody waits for the clock
		const one = [turn(1, 1, 1), turn(3, 1, 2), turn(2, 3, 3)];
		const players = [creator, alice, bob];
		for (let i = 0; i < 3; i++) {
			await Table.write.makeCommitment([BigInt(players[i]), one[i].hash, BOND, zeroAddress], {account: players[i]});
		}
		await Table.write.advanceCycle({account: carol});
		expect((await Table.read.getCycle()).commiting).to.equal(false);
		for (let i = 0; i < 3; i++) {
			await Table.write.reveal([BigInt(players[i]), one[i].moves, one[i].secret, one[i].furtherActions, zeroAddress], {
				account: players[i],
			});
		}
		await Table.write.advanceCycle({account: carol});
		const two = await Table.read.getCycle();
		expect(two.cycleNumber).to.equal(started.cycleNumber + 1n);
		expect(two.commiting).to.equal(true);
		// the next cycle runs its full length from the push
		expect(two.phaseEnd - two.phaseStart).to.equal(45n);
		expect(two.phaseStart - started.phaseStart < 45n).to.equal(true);

		// CYCLE TWO, ADVANCED BY THE CLOCK: bob has vanished
		const second = [turn(1, 2, 1), turn(3, 2, 2)];
		await Table.write.makeCommitment([BigInt(creator), second[0].hash, BOND, zeroAddress], {account: creator});
		await Table.write.makeCommitment([BigInt(alice), second[1].hash, BOND, zeroAddress], {account: alice});
		await expect(Table.write.advanceCycle({account: carol})).rejects.toThrow(/StillWaitingToCommit/);
		await networkHelpers.time.increaseTo(two.phaseEnd);
		expect((await Table.read.getCycle()).commiting).to.equal(false);
		await Table.write.reveal([BigInt(creator), second[0].moves, second[0].secret, second[0].furtherActions, zeroAddress], {
			account: creator,
		});
		await Table.write.reveal([BigInt(alice), second[1].moves, second[1].secret, second[1].furtherActions, zeroAddress], {
			account: alice,
		});
		await networkHelpers.time.increaseTo(two.phaseEnd + 15n);
		const three = await Table.read.getCycle();
		expect(three.cycleNumber).to.equal(two.cycleNumber + 1n);
		expect(three.commiting).to.equal(true);

		// THE CREATOR'S FORFEIT: bob has not acted this commit phase
		await expect(Table.write.forfeitMember([BigInt(bob)], {account: alice})).rejects.toThrow();
		await Table.write.forfeitMember([BigInt(bob)], {account: creator});
		expect((await Table.read.getRoster())[1].map((m: bigint) => m)).not.toContain(BigInt(bob));
		expect((await Table.read.getAttendance()).waitedFor).to.equal(2n);

		// the cells are the table's, not the world's
		const [a, b] = await Table.read.getCells([[xyToBigIntID(1, 2), xyToBigIntID(3, 2)]]);
		expect(a.owner.toLowerCase()).to.equal(creator.toLowerCase());
		expect(b.owner.toLowerCase()).to.equal(alice.toLowerCase());
		const [inTheWorld] = await env.Stratagems.read.getCells([[xyToBigIntID(1, 2)]]);
		expect(inTheWorld.owner).to.equal(zeroAddress);

		// NOTHING LEAVES BEFORE THE SETTLEMENT, a forfeited member's reserve
		// included (L4-23): a payout out of the table is the end's, below
		await expect(Table.write.withdrawFromReserve([maxUint256], {account: bob})).rejects.toThrow(/TableNotSettled/);

		// NOTHING REACHED THE GENERATOR from the table
		const generatorAfter = await Promise.all([creator, alice, bob].map((p) => env.GemsGenerator.read.balanceOf([p])));
		expect(generatorAfter).toEqual(generatorBefore);
		expect(await env.GemsGenerator.read.totalSupply()).to.equal(generatorSupplyBefore);
		expect(await env.GemsGenerator.read.games([Table.address])).to.equal(0n);

		console.log(
			`table gas: creation ${creationGas}, its approval ${approvalGas}, first stake ${firstStakeGas}`,
		);
	});
});

// ---------------------------------------------------------------------------
// STEP L4: a table ends, is settled, and has a winner
// ---------------------------------------------------------------------------

const GEM = parseEther('1');
const EVIL_OWNER = '0xffffffffffffffffffffffffffffffffffffffff';
const lower = (a: string) => a.toLowerCase();
const NONE = 0;
const BLUE = 1;
const RED = 2;
const EVIL = 6;

/**
 * A table of `seats` players (the first `seats` other accounts, all seated and
 * started), playing `cycles` cycles, `stakeGems` gems a seat, a gap of
 * `gapPercent`. Its helpers play a cycle (everyone commits, early advance,
 * everyone reveals, early advance) and read what the end needs.
 */
async function aStartedTable(params: {seats: number; cycles: number; stakeGems: number; gapPercent: number}) {
	const env = await deployStratagemsWithTestConfig();
	const {publicClient} = await getConnection();
	const {deployments} = env;
	const Factory = await fetchContract(deployments['StratagemsTableFactory'] as Deployment<typeof abis.CommitRevealGameFactory>);
	const implementation = deployments['StratagemsTableImplementation'];
	const Simulation = (await fetchContract(deployments['StratagemsTableSimulation'] as any)) as any;
	const players = env.otherAccounts.slice(0, params.seats) as `0x${string}`[];
	const [creator] = players;
	const outsider = env.otherAccounts[params.seats] as `0x${string}`;
	const stake = BigInt(params.stakeGems) * GEM;
	for (const player of [...players, outsider]) {
		await env.TestTokens.write.transfer([player, stake * 2n], {account: env.tokensBeneficiary});
	}
	const creation = await Factory.write.createGame(
		[params.seats, params.cycles, tableOptions(params.stakeGems, params.gapPercent)],
		{account: creator},
	);
	const receipt = await publicClient.waitForTransactionReceipt({hash: creation});
	const [created] = parseEventLogs({abi: Factory.abi, logs: receipt.logs, eventName: 'GameCreated'});
	const Table = (await fetchContract({address: created.args.game, abi: implementation.abi as any})) as any;
	for (const player of players) {
		await env.TestTokens.write.approve([Table.address, stake], {account: player});
		await Table.write.addToReserveAndFund([BigInt(player), stake, zeroAddress], {account: player});
	}
	await Table.write.start({account: creator});

	type Moves = [x: number, y: number, color: number][];
	/** One cycle: every member still seated commits (moves or none), both phases close early. */
	async function playCycle(turns: {[player: number]: Moves} = {}, options?: {skipReveal?: number}) {
		const [, members] = await Table.read.getRoster();
		const seated = players.filter((p) => (members as bigint[]).includes(BigInt(p)));
		const commitments = new Map<string, ReturnType<typeof prepareCommitment>>();
		for (const p of seated) {
			const moves = (turns[players.indexOf(p)] ?? []).map(([x, y, color]) => ({position: xyToBigIntID(x, y), color}));
			const commitment = prepareCommitment(moves, randomSecret());
			commitments.set(p, commitment);
			await Table.write.makeCommitment([BigInt(p), commitment.hash, BigInt(moves.length) * GEM, zeroAddress], {
				account: p,
			});
		}
		await Table.write.advanceCycle({account: outsider});
		for (const p of seated) {
			if (options?.skipReveal !== undefined && players[options.skipReveal] === p) continue;
			const c = commitments.get(p)!;
			await Table.write.reveal([BigInt(p), c.moves, c.secret, c.furtherActions, zeroAddress], {account: p});
		}
		if (options?.skipReveal === undefined) {
			await Table.write.advanceCycle({account: outsider});
		} else {
			const cycle = await Table.read.getCycle();
			await networkHelpers.time.increaseTo(cycle.phaseEnd);
		}
		return commitments;
	}

	/** The board as the chain's `CellsWritten` events left it, raw, as the client's indexer folds it. */
	async function storedBoard() {
		const logs = await publicClient.getContractEvents({
			address: Table.address,
			abi: Table.abi,
			eventName: 'CellsWritten',
			fromBlock: 0n,
		});
		const MASK64 = (1n << 64n) - 1n;
		const field = (word: bigint, shift: number, bits: number) => Number((word >> BigInt(shift)) & ((1n << BigInt(bits)) - 1n));
		const cells = new Map<bigint, any>();
		const owners = new Map<bigint, `0x${string}`>();
		for (const log of logs as any[]) {
			for (const word of log.args.owners as bigint[]) {
				owners.set(word & MASK64, `0x${(word >> 64n).toString(16).padStart(40, '0')}`);
			}
			for (const word of log.args.cells as bigint[]) {
				const delta = field(word, 88, 8);
				cells.set(word >> 128n, {
					lastCycleUpdate: field(word, 0, 24),
					cycleWhenTokenIsAdded: field(word, 24, 24),
					producingCycles: field(word, 48, 24),
					color: field(word, 72, 8),
					life: field(word, 80, 8),
					delta: delta >= 128 ? delta - 256 : delta,
					enemyMap: field(word, 96, 8),
					distribution: field(word, 104, 8),
					stake: field(word, 112, 8),
				});
			}
		}
		return [...cells.entries()].map(([position, cell]) => ({
			position,
			owner: owners.get(position) ?? zeroAddress,
			cell,
			start: {owner: zeroAddress, cycle: 0, life: 0},
		}));
	}

	/** What the end will pay each account, by the simulation over the stored board (L4-18's projection). */
	async function projection() {
		const [, lastCycleNumber] = await Table.read.getEnd();
		const board = await storedBoard();
		const coloured = board.filter((c) => c.cell.color !== NONE && c.cell.stake !== 0).map((c) => c.position);
		const settledCycle = Number(lastCycleNumber) + env.config.maxLife;
		const {result} = await Simulation.simulate.poke([board, settledCycle, coloured]);
		const credit = new Map<string, bigint>();
		const add = (to: string, amount: bigint) => credit.set(lower(to), (credit.get(lower(to)) ?? 0n) + amount);
		for (const payout of result.payouts) add(payout.to, payout.amount);
		for (const stored of result.cells) {
			if (stored.cell.color !== NONE && stored.cell.life !== 0 && coloured.includes(stored.position)) {
				add(stored.owner, BigInt(stored.cell.stake) * GEM);
			}
		}
		return {credit, coloured};
	}

	const reserveOf = async (p: string) => (await Table.read.getReserve([BigInt(p)])) as bigint;

	return {env, Table, Simulation, players, creator, outsider, stake, playCycle, storedBoard, projection, reserveOf};
}

const threePlayersThreeCycles = () => aStartedTable({seats: 3, cycles: 3, stakeGems: 10, gapPercent: 50});
const twoPlayersTwoCycles = () => aStartedTable({seats: 2, cycles: 2, stakeGems: 10, gapPercent: 50});
const twoPlayersManyCycles = () => aStartedTable({seats: 2, cycles: 12, stakeGems: 10, gapPercent: 50});

describe('a table ends, and has a winner', function () {
	it('takes exactly its stake for a seat, once, and keeps it until the table is settled', async function () {
		const env = await deployStratagemsWithTestConfig();
		const Factory = await fetchContract(env.deployments['StratagemsTableFactory'] as Deployment<typeof abis.CommitRevealGameFactory>);
		const [creator, alice] = env.otherAccounts as `0x${string}`[];
		const {publicClient} = await getConnection();
		const receipt = await publicClient.waitForTransactionReceipt({
			hash: await Factory.write.createGame([2, 3, tableOptions(5, 0)], {account: creator}),
		});
		const [created] = parseEventLogs({abi: Factory.abi, logs: receipt.logs, eventName: 'GameCreated'});
		const Table = (await fetchContract({
			address: created.args.game,
			abi: env.deployments['StratagemsTableImplementation'].abi as any,
		})) as any;
		const stake = 5n * GEM;
		for (const p of [creator, alice]) {
			await env.TestTokens.write.transfer([p, stake * 3n], {account: env.tokensBeneficiary});
			await env.TestTokens.write.approve([Table.address, stake * 3n], {account: p});
		}
		expect(await Table.read.getTableOptions()).toEqual([stake, 5, 0]);
		await expect(Table.write.addToReserve([BigInt(alice), stake - 1n], {account: alice})).rejects.toThrow(/TableStakeIsFixed/);
		await expect(Table.write.addToReserve([BigInt(alice), stake + 1n], {account: alice})).rejects.toThrow(/TableStakeIsFixed/);
		await Table.write.addToReserve([BigInt(alice), stake], {account: alice});
		await expect(Table.write.addToReserve([BigInt(alice), stake], {account: alice})).rejects.toThrow(/TableStakeIsFixed/);
		// before the start a seat is left whole, or not at all
		await expect(Table.write.withdrawFromReserve([GEM], {account: alice})).rejects.toThrow(/TableStakeIsFixed/);
		await Table.write.withdrawFromReserve([maxUint256], {account: alice});
		expect((await Table.read.getRoster())[1]).toEqual([]);
		await Table.write.addToReserve([BigInt(alice), stake], {account: alice});
		await Table.write.addToReserve([BigInt(creator), stake], {account: creator});
		await Table.write.start({account: creator});
		// after it: no top-up through the commitment, no withdrawal
		const turn0 = prepareCommitment([], randomSecret());
		await expect(
			Table.write.makeCommitmentWithExtraReserve([BigInt(alice), turn0.hash, 0n, GEM, zeroAddress], {account: alice}),
		).rejects.toThrow(/TableStakeIsFixed/);
		await expect(Table.write.withdrawFromReserve([maxUint256], {account: alice})).rejects.toThrow(/TableNotSettled/);
		// options it cannot read seat nobody
		const bad = await publicClient.waitForTransactionReceipt({
			hash: await Factory.write.createGame([2, 3, `0x${'00'.repeat(25)}01${'00'.repeat(6)}`], {account: creator}),
		});
		const [badCreated] = parseEventLogs({abi: Factory.abi, logs: bad.logs, eventName: 'GameCreated'});
		const BadTable = (await fetchContract({address: badCreated.args.game, abi: Table.abi})) as any;
		await env.TestTokens.write.approve([BadTable.address, stake], {account: alice});
		await expect(BadTable.write.addToReserve([BigInt(alice), stake], {account: alice})).rejects.toThrow(/InvalidTableOptions/);
	});

	it('sizes its board to the gems: a square of ceil(sqrt(seats x stake x (1 + gap))) cells a side', async function () {
		const expected = (seats: number, stakeGems: number, gap: number) => {
			const cells = Math.ceil((seats * stakeGems * (100 + gap)) / 100);
			const side = Math.ceil(Math.sqrt(cells));
			const min = -Math.floor(side / 2);
			return [min, min + side - 1, BigInt(side)];
		};
		for (const seats of [2, 3, 5, 8]) {
			for (const gapPercent of [0, 50]) {
				const {Table} = await aStartedTable({seats, cycles: 2, stakeGems: 10, gapPercent});
				expect(await Table.read.getBoard(), `${seats} seats, a gap of ${gapPercent}%`).toEqual(
					expected(seats, 10, gapPercent),
				);
			}
		}
		// one cell per gem, exactly, when it is a square
		expect(expected(2, 8, 0)).toEqual([-2, 1, 4n]);
	});

	it('skips a move outside the square, and credits a removal and a payout to the reserve', async function () {
		const t = await loadFixture(twoPlayersManyCycles);
		const [me, alice] = t.players;
		const [min, max] = (await t.Table.read.getBoard()) as [number, number, bigint];
		const walletBefore = await t.env.TestTokens.read.balanceOf([me]);
		// outside: costs nothing, writes nothing
		await t.playCycle({0: [[max + 1, 0, BLUE]], 1: [[min, min - 1, RED]]});
		expect(await t.reserveOf(me)).to.equal(t.stake);
		expect(await t.reserveOf(alice)).to.equal(t.stake);
		const [outside] = await t.Table.read.getCells([[xyToBigIntID(max + 1, 0)]]);
		expect(outside.color).to.equal(NONE);

		// a lone cell grows to full life, and its removal returns its gem to the reserve
		await t.playCycle({0: [[max, max, BLUE]]});
		for (let i = 0; i < 5; i++) await t.playCycle();
		const [full] = await t.Table.read.getCells([[xyToBigIntID(max, max)]]);
		expect(full.life).to.equal(t.env.config.maxLife);
		const beforeRemoval = await t.reserveOf(me);
		await t.playCycle({0: [[max, max, NONE]]});
		expect(await t.reserveOf(me)).to.equal(beforeRemoval + GEM);
		expect(await t.Table.read.unsettledCells()).to.equal(0n);

		// a cell killed by its neighbours pays its killers' reserves, not their wallets
		const aliceWallet = await t.env.TestTokens.read.balanceOf([alice]);
		await t.playCycle({0: [[0, 0, BLUE]], 1: [[-1, 0, RED], [1, 0, RED], [0, -1, RED], [0, 1, RED]]});
		const beforeDeath = await t.reserveOf(alice);
		await t.playCycle();
		await t.playCycle();
		await t.Table.write.poke([xyToBigIntID(0, 0)], {account: t.outsider});
		const [dead] = await t.Table.read.getCells([[xyToBigIntID(0, 0)]]);
		expect(dead.life).to.equal(0);
		expect(await t.reserveOf(alice)).to.equal(beforeDeath + GEM);
		expect(await t.env.TestTokens.read.balanceOf([alice])).to.equal(aliceWallet);
		expect(await t.env.TestTokens.read.balanceOf([me])).to.equal(walletBefore);
	});

	it('is played to its end, settled in two batches as the simulation projected, and names its winner', async function () {
		const t = await loadFixture(threePlayersThreeCycles);
		const [a, b, c] = t.players;
		await expect(t.Table.write.settle([[]], {account: t.outsider})).rejects.toThrow(/TableNotEnded/);
		await t.playCycle({0: [[0, 0, BLUE], [2, 2, BLUE]], 1: [[-1, 0, RED], [1, 0, RED], [0, -1, RED]], 2: [[-2, -2, 3]]});
		await t.playCycle({1: [[0, 1, RED]], 2: [[-2, -1, 3]]});
		// the last cycle: c commits and never reveals
		await t.playCycle({0: [[2, 1, BLUE]], 1: [[1, 1, RED]], 2: [[-1, -2, 3]]}, {skipReveal: 2});
		expect(await t.Table.read.hasEnded()).to.equal(true);
		const turn = prepareCommitment([], randomSecret());
		await expect(t.Table.write.makeCommitment([BigInt(a), turn.hash, 0n, zeroAddress], {account: a})).rejects.toThrow(
			/GameEnded/,
		);

		const {credit, coloured} = await t.projection();
		const before = await Promise.all(t.players.map(t.reserveOf));
		expect(coloured.length > 4).to.equal(true);
		const half = Math.floor(coloured.length / 2);
		await t.Table.write.settle([coloured.slice(0, half)], {account: t.outsider});
		expect(await t.Table.read.unsettledCells()).to.equal(BigInt(coloured.length - half));
		expect(await t.Table.read.isSettled()).to.equal(false);
		// the last batch would finalise, and c's commitment is open
		await expect(t.Table.write.settle([coloured.slice(half)], {account: t.outsider})).rejects.toThrow(
			/TableCommitmentOpen/,
		);
		await t.Table.write.forfeitMissedReveal([BigInt(c)], {account: c});
		const burnt = before[2] - (await t.reserveOf(c));
		const settleReceipt = await (await getConnection()).publicClient.waitForTransactionReceipt({
			hash: await t.Table.write.settle([coloured.slice(half)], {account: t.outsider}),
		});
		expect(await t.Table.read.isSettled()).to.equal(true);
		expect(await t.Table.read.unsettledCells()).to.equal(0n);

		const after = await Promise.all(t.players.map(t.reserveOf));
		for (let i = 0; i < 3; i++) {
			const expected = before[i] + (credit.get(lower(t.players[i])) ?? 0n) - (i === 2 ? burnt : 0n);
			expect(after[i], `player ${i}'s reserve`).to.equal(expected);
		}
		// the scores are the reserves less the stake (no collision here), and the winners the best
		const [scorePlayers, scores] = (await t.Table.read.getScores()) as [bigint[], bigint[]];
		expect(scorePlayers.map((p) => lower(`0x${p.toString(16).padStart(40, '0')}`)).sort()).toEqual(
			t.players.map(lower).sort(),
		);
		for (let i = 0; i < scorePlayers.length; i++) {
			const index = t.players.findIndex((p) => BigInt(p) === scorePlayers[i]);
			expect(scores[i]).to.equal(after[index] - t.stake);
		}
		const top = scores.reduce((m, s) => (s > m ? s : m), scores[0]);
		const winners = (await t.Table.read.winners()) as bigint[];
		expect(winners).toEqual(scorePlayers.filter((_, i) => scores[i] === top));
		const events = parseEventLogs({abi: t.Table.abi, logs: settleReceipt.logs, eventName: 'TableSettled'}) as any[];
		expect(events[0].args.topScore).to.equal(top);

		// the final board stays readable, and a payout out of the table now goes through
		const cells = await t.Table.read.getCells([coloured]);
		expect(cells.every((cell: any) => cell.stake === 0 && cell.color !== NONE)).to.equal(true);
		const wallet = await t.env.TestTokens.read.balanceOf([b]);
		await t.Table.write.withdrawFromReserve([maxUint256], {account: b});
		expect(await t.env.TestTokens.read.balanceOf([b])).to.equal(wallet + after[1]);
		// settling again changes nothing
		await t.Table.write.settle([coloured], {account: t.outsider});
		expect(await t.reserveOf(a)).to.equal(after[0]);
	});

	it('settles to the same scores whether it was poked after its end or not', async function () {
		const scoresOf = async (pokeAfterEnd: boolean) => {
			const t = await loadFixture(threePlayersThreeCycles);
			await t.playCycle({0: [[0, 0, BLUE]], 1: [[-1, 0, RED], [1, 0, RED], [0, -1, RED]], 2: [[2, 2, 3]]});
			await t.playCycle({1: [[0, 1, RED]]});
			await t.playCycle({0: [[2, 1, BLUE]]});
			const {coloured} = await t.projection();
			if (pokeAfterEnd) {
				for (const position of coloured) await t.Table.write.poke([position], {account: t.outsider});
				await networkHelpers.time.increase(600);
				await t.Table.write.poke([coloured[0]], {account: t.outsider});
			}
			await t.Table.write.settle([coloured], {account: t.outsider});
			return t.Table.read.getScores();
		};
		expect(await scoresOf(true)).toEqual(await scoresOf(false));
	});

	it('shares the win on a tie', async function () {
		const t = await loadFixture(twoPlayersTwoCycles);
		await t.playCycle({0: [[0, 0, BLUE]], 1: [[2, 2, RED]]});
		await t.playCycle();
		const {coloured} = await t.projection();
		await t.Table.write.settle([coloured], {account: t.outsider});
		const [, scores] = await t.Table.read.getScores();
		expect(scores).toEqual([0n, 0n]);
		expect(((await t.Table.read.winners()) as bigint[]).length).to.equal(2);
	});

	it('scores a collision as nothing for both colliders, in either order, and an explicit Evil placement as one gem lost', async function () {
		for (const order of [
			[0, 1],
			[1, 0],
		]) {
			const t = await aStartedTable({seats: 2, cycles: 2, stakeGems: 10, gapPercent: 50});
			const [, members] = await t.Table.read.getRoster();
			const moves = [
				[{position: xyToBigIntID(0, 0), color: BLUE}],
				[{position: xyToBigIntID(0, 0), color: RED}],
			];
			const commitments = moves.map((m) => prepareCommitment(m, randomSecret()));
			for (const i of [0, 1]) {
				await t.Table.write.makeCommitment([BigInt(t.players[i]), commitments[i].hash, GEM, zeroAddress], {
					account: t.players[i],
				});
			}
			await t.Table.write.advanceCycle({account: t.outsider});
			for (const i of order) {
				const c = commitments[i];
				await t.Table.write.reveal([BigInt(t.players[i]), c.moves, c.secret, c.furtherActions, zeroAddress], {
					account: t.players[i],
				});
			}
			await t.Table.write.advanceCycle({account: t.outsider});
			const [cell] = await t.Table.read.getCells([[xyToBigIntID(0, 0)]]);
			expect(cell.color).to.equal(EVIL);
			expect(lower(cell.owner)).to.equal(EVIL_OWNER);
			for (const p of t.players) expect(await t.Table.read.getCollisionCredit([BigInt(p)])).to.equal(GEM);
			// the second player places Evil on a free cell, on purpose
			await t.playCycle({1: [[2, 2, EVIL]]});
			const {coloured} = await t.projection();
			await t.Table.write.settle([coloured], {account: t.outsider});
			const [scorePlayers, scores] = (await t.Table.read.getScores()) as [bigint[], bigint[]];
			expect(scorePlayers).toEqual(members);
			const scoreOf = (p: string) => scores[scorePlayers.findIndex((s) => s === BigInt(p))];
			expect(scoreOf(t.players[0]), `order ${order}`).to.equal(0n);
			expect(scoreOf(t.players[1]), `order ${order}`).to.equal(-GEM);
		}
	});

	it('measures what a settled cell costs', async function () {
		const t = await aStartedTable({seats: 2, cycles: 12, stakeGems: 40, gapPercent: 50});
		const cells: [number, number, number][] = [];
		for (let i = 0; i < 8; i++) cells.push([i - 4, -3 + (i % 2) * 2, BLUE]);
		const enemies: [number, number, number][] = cells.map(([x, y]) => [x, y + 1, RED]);
		await t.playCycle({0: cells, 1: enemies});
		for (let i = 0; i < 11; i++) await t.playCycle();
		const {coloured} = await t.projection();
		const {publicClient} = await getConnection();
		const receipt = await publicClient.waitForTransactionReceipt({
			hash: await t.Table.write.settle([coloured], {account: t.outsider}),
		});
		console.log(`settle gas: ${receipt.gasUsed} for ${coloured.length} cells, ${receipt.gasUsed / BigInt(coloured.length)} a cell`);
	});

	it("measures what a table's rules add to a chunk of 32 placements, against the world's", async function () {
		const t = await aStartedTable({seats: 2, cycles: 12, stakeGems: 40, gapPercent: 50});
		const [min] = (await t.Table.read.getBoard()) as [number, number, bigint];
		const moves: {position: bigint; color: number}[] = [];
		for (let y = min; moves.length < 32; y += 2) {
			for (let x = min; x <= min + 10 && moves.length < 32; x += 2) moves.push({position: xyToBigIntID(x, y), color: BLUE});
		}
		const {publicClient} = await getConnection();
		async function chunkGas(Game: any, player: `0x${string}`, others: `0x${string}`[]) {
			const c = prepareCommitment(moves, randomSecret());
			await Game.write.makeCommitment([BigInt(player), c.hash, 32n * GEM, zeroAddress], {account: player});
			for (const other of others) {
				const empty = prepareCommitment([], randomSecret());
				await Game.write.makeCommitment([BigInt(other), empty.hash, 0n, zeroAddress], {account: other});
			}
			return {c, reveal: async () =>
				(
					await publicClient.waitForTransactionReceipt({
						hash: await Game.write.reveal([BigInt(player), c.moves, c.secret, c.furtherActions, zeroAddress], {
							account: player,
						}),
					})
				).gasUsed};
		}
		const atTable = await chunkGas(t.Table, t.players[0], [t.players[1]]);
		await t.Table.write.advanceCycle({account: t.outsider});
		const tableGas = await atTable.reveal();
		const placed = await t.Table.read.getCells([moves.map((m) => m.position)]);
		expect(placed.every((cell: any) => cell.color === BLUE)).to.equal(true);

		// the same chunk in the world, from a player who stakes there
		const world = t.env.Stratagems as any;
		const player = t.outsider;
		await t.env.TestTokens.write.transfer([player, 40n * GEM], {account: t.env.tokensBeneficiary});
		await t.env.TestTokens.write.approve([world.address, 40n * GEM], {account: player});
		await world.write.addToReserve([BigInt(player), 40n * GEM], {account: player});
		const cycle = await world.read.getCycle();
		if (!cycle.commiting) await networkHelpers.time.increaseTo(cycle.phaseEnd);
		const inWorld = await chunkGas(world, player, []);
		await networkHelpers.time.increaseTo((await world.read.getCycle()).phaseEnd);
		const worldGas = await inWorld.reveal();
		console.log(
			`a chunk of 32 isolated placements: table ${tableGas}, world ${worldGas}, the table's rules ${tableGas - worldGas} (${(Number(tableGas - worldGas) / 32).toFixed(0)} a move)`,
		);
	});
});
