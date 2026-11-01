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

	const creation = await Factory.write.createGame([3], {account: creator});
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
		const {env, Factory, Table, noRewards, creator} = await loadFixture(withATableOfThree);
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
		// a seated member tops up: a second deposit into the table, by allowance
		const topUpGas = await gasOf(await takeSeat(alice));
		expect(await Table.read.getReserve([BigInt(alice)])).to.equal(STAKE * 2n);

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

		// A PAYOUT OUT OF THE TABLE: bob takes back what he staked
		const bobBefore = await env.TestTokens.read.balanceOf([bob]);
		const bobReserve = await Table.read.getReserve([BigInt(bob)]);
		await Table.write.withdrawFromReserve([maxUint256], {account: bob});
		expect(await env.TestTokens.read.balanceOf([bob])).to.equal(bobBefore + bobReserve);

		// NOTHING REACHED THE GENERATOR from the table
		const generatorAfter = await Promise.all([creator, alice, bob].map((p) => env.GemsGenerator.read.balanceOf([p])));
		expect(generatorAfter).toEqual(generatorBefore);
		expect(await env.GemsGenerator.read.totalSupply()).to.equal(generatorSupplyBefore);
		expect(await env.GemsGenerator.read.games([Table.address])).to.equal(0n);

		console.log(
			`table gas: creation ${creationGas}, its approval ${approvalGas}, first stake ${firstStakeGas}, a member's second stake ${topUpGas}`,
		);
	});
});
