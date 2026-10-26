/**
 * ONE MANUAL CYCLE ON STRATAGEMS' OWN CONTRACTS, the policy the offline world
 * deploys (`020_deploy_game`'s `offline` environment, step O of
 * work/plans/join-template-commit-reveal.md): no clock, the cycle moves only
 * when everyone it waits for has acted and someone pushes it, and every push
 * says so (`CycleAdvanced`), which is what the board's indexer stamps its cycle
 * from in a world. The base's own suite (`test/js`) runs the policy on a stub
 * game; this runs it on the game the world plays, the cells included.
 */
import {expect, describe, it} from 'vitest';
import {decodeEventLog, parseEther, zeroAddress} from 'viem';
import {prepareCommitment, randomSecret, xyToBigIntID} from 'stratagems-common';
import {getConnection, loadFixture} from '../utils/connection.js';
import {deployStratagemsWithManualCycle} from './utils/stratagems-test.js';

const STAKE = parseEther('32');

async function withTwoStakedPlayers() {
	const env = await deployStratagemsWithManualCycle();
	const players = env.otherAccounts.slice(0, 2);
	// as the world stakes its seats: the beneficiary credits each reserve
	await env.TestTokens.write.approve([env.Stratagems.address, STAKE * 2n], {account: env.tokensBeneficiary});
	for (const player of players) {
		await (env.Stratagems as any).write.addToReserve([BigInt(player), STAKE], {account: env.tokensBeneficiary});
	}
	return {env, players};
}

async function advancedEvents(env: Awaited<ReturnType<typeof deployStratagemsWithManualCycle>>, hash: `0x${string}`) {
	const {publicClient} = await getConnection();
	const receipt = await publicClient.getTransactionReceipt({hash});
	const events = [];
	for (const log of receipt.logs) {
		try {
			const event = decodeEventLog({abi: env.Stratagems.abi, data: log.data, topics: log.topics}) as any;
			if (event.eventName === 'CycleAdvanced') events.push(event.args);
		} catch {
			// another contract's log, or another event
		}
	}
	return events;
}

describe('Stratagems under the Manual cycle policy', function () {
	it('is deployed with no clock', async function () {
		const {env} = await loadFixture(withTwoStakedPlayers);
		expect(env.config.cyclePolicy).to.equal(1);
		expect(env.config.commitPhaseDuration).to.equal(0n);
		expect(env.config.revealPhaseDuration).to.equal(0n);
		const cycle = await (env.Stratagems as any).read.getCycle();
		expect(cycle.commiting).to.equal(true);
		expect(cycle.phaseStart).to.equal(0n);
		expect(cycle.phaseEnd).to.equal(0n);
	});

	it('plays one cycle: commit, advance, reveal, advance, and the cells are on the board', async function () {
		const {env, players} = await loadFixture(withTwoStakedPlayers);
		const S = env.Stratagems as any;
		const [alice, bob] = players;
		const start = (await S.read.getCycle()).cycleNumber as bigint;

		const turns = [
			prepareCommitment([{position: xyToBigIntID(1, 1), color: 1}], randomSecret()),
			prepareCommitment([{position: xyToBigIntID(3, 3), color: 2}], randomSecret()),
		];

		await S.write.makeCommitment([BigInt(alice), turns[0].hash, STAKE, zeroAddress], {account: alice});
		// waiting for bob: nobody can push the cycle on without him
		await expect(S.write.advanceCycle({account: alice})).rejects.toThrow(/StillWaitingToCommit/);
		await S.write.makeCommitment([BigInt(bob), turns[1].hash, STAKE, zeroAddress], {account: bob});

		const toReveal = await S.write.advanceCycle({account: alice});
		expect(await advancedEvents(env, toReveal)).toEqual([{cycleNumber: start, commiting: false, pushedBy: alice}]);
		expect((await S.read.getCycle()).commiting).to.equal(false);

		await S.write.reveal([BigInt(alice), turns[0].moves, turns[0].secret, turns[0].furtherActions, zeroAddress], {
			account: alice,
		});
		await expect(S.write.advanceCycle({account: alice})).rejects.toThrow(/StillWaitingToReveal/);
		await S.write.reveal([BigInt(bob), turns[1].moves, turns[1].secret, turns[1].furtherActions, zeroAddress], {
			account: bob,
		});

		const toCommit = await S.write.advanceCycle({account: bob});
		expect(await advancedEvents(env, toCommit)).toEqual([{cycleNumber: start + 1n, commiting: true, pushedBy: bob}]);
		const cycle = await S.read.getCycle();
		expect(cycle.cycleNumber).to.equal(start + 1n);
		expect(cycle.commiting).to.equal(true);

		const [a, b] = await S.read.getCells([[xyToBigIntID(1, 1), xyToBigIntID(3, 3)]]);
		expect(a.owner.toLowerCase()).to.equal(alice.toLowerCase());
		expect(a.color).to.equal(1);
		expect(b.owner.toLowerCase()).to.equal(bob.toLowerCase());
		expect(b.color).to.equal(2);
	});

	it('does not move when nobody acts', async function () {
		const {env} = await loadFixture(withTwoStakedPlayers);
		const S = env.Stratagems as any;
		const before = await S.read.getCycle();
		// nobody committed, so the cycle waits for everyone it waits for
		await expect(S.write.advanceCycle({account: env.deployer})).rejects.toThrow(/StillWaitingToCommit/);
		expect(await S.read.getCycle()).toEqual(before);
	});
});
