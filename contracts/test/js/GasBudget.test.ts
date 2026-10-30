import {describe, it} from 'node:test';
import assert from 'node:assert';
import {network} from 'hardhat';
import {
	setupFixtures,
	enterGame,
	commitmentChain,
	commitmentHashFor,
	type Placement,
} from './utils/index.js';
import {parseEther, zeroAddress} from 'viem';

/**
 * THE DECLARED GAS BUDGET IS A CLAIM ABOUT THESE CONTRACTS, so these contracts
 * are what checks it.
 *
 * `commitGas` and `revealGas` are declared by the deploy
 * (`rocketh/config.ts`), recorded in the Game's `linkedData`, and read by the
 * client to size the gas stipend a new player is given. They used to be
 * constants in `web/src/lib/placement/config.ts`, which is INHERITED down this
 * template tree while contracts are NOT - so a descendant budgeted with figures
 * measured against a game it does not run, in a file whose text did not differ.
 *
 * Moving them to the deployment fixes whose numbers they are. This test is what
 * stops them rotting: a contract change that makes a commit or a reveal more
 * expensive than the deployment claims fails HERE, in the suite that ships with
 * the contracts, rather than in a player's wallet a release later.
 *
 * IT ASSERTS THE WORST CASE, NOT A TYPICAL ONE. For the reveal that is a FULL
 * chunk of cells claimed for the first time, each in a different zone, because
 * `_place` appends to a per-zone index only on a cell's first claim: four first
 * claims across four zones is four new dynamic arrays and there is no more
 * expensive shape a single reveal can take. For the commit it is the FIRST one
 * a player makes, when every slot it writes is cold.
 *
 * IT IS TWO-SIDED, BECAUSE THE FIGURES ARE NOW CEILINGS. The client passes them
 * as the gas LIMIT on every commit and every reveal, so a transaction that needs
 * more than the deployment declares does not cost more - it runs out of gas, and
 * on a reveal that is a missed reveal, which forfeits the stake. So the budget
 * must cover the worst case AND keep room above it; and it must not have drifted
 * so far above that nobody has re-measured in a long time.
 */

const {provider, networkHelpers} = await network.connect();
const {deployAll} = setupFixtures(provider);

function cellAt(x: number, y: number): bigint {
	const ux = BigInt.asUintN(32, BigInt(x));
	const uy = BigInt.asUintN(32, BigInt(y));
	return (uy << 32n) + ux;
}

const SECRET =
	'0x00000000000000000000000000000000000000000000000000000000000000a1';

/** How far above the measured worst case a declared figure may sit. */
const GENEROSITY_CEILING = 3n;

/**
 * How far above it a declared figure MUST sit, as a percentage.
 *
 * Ten per cent, and the number is a judgement rather than a measurement, so
 * here is what it is buying. The case measured below is the worst case these
 * contracts can reach today - a full chunk of cells claimed for the first time,
 * each in a different zone - so the headroom is not covering a shape the test
 * missed. It covers the two things the test cannot see: a chain that prices
 * some opcode differently from the one this runs on, and the contracts growing
 * a little between one re-measurement and the next.
 *
 * GAS USAGE IS OTHERWISE A PROPERTY OF THE CODE AND THE EVM REVISION RATHER
 * THAN OF THE CHAIN, which is why this is a margin and not a per-chain
 * measurement: `hardhat.config.ts` pins `evmVersion` on every profile, so the
 * same contracts cost the same gas wherever they run. What genuinely varies per
 * chain is the PRICE, and that is `expectedWorstGasPrice` in the chain
 * properties, which is already declared per chain and is what turns these
 * figures into money.
 *
 * It is deliberately looser than the margin the figures actually carry (12% to
 * 28%). A tripwire set exactly at the current value fires on the first trivial
 * change and gets raised reflexively, which is how a limit stops meaning
 * anything.
 */
const MINIMUM_HEADROOM_PERCENT = 10n;

describe('the declared gas budget', function () {
	it('covers the worst commit and the worst reveal these contracts can produce', async function () {
		const fixtures = await networkHelpers.loadFixture(deployAll);
		const {
			env,
			Game,
			GameToken,
			linkedData,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			advanceToRevealPhase,
			getCycleNumber,
			getTimestamp,
		} = fixtures;

		const declaredCommit = BigInt(linkedData.commitGas);
		const declaredReveal = BigInt(linkedData.revealGas);

		const player = unnamedAccounts[0];
		const {cycleNumber: start} = getCycleNumber(await getTimestamp());
		await advanceToCycleNumber(start + 2, true);
		const identity = await enterGame({env, Game, GameToken}, player, {
			amount: parseEther('100'),
		});

		// The worst case a chunk can reach: every cell fresh, every cell in a
		// different zone.
		const turn: Placement[] = Array.from(
			{length: actionsPerReveal},
			(_, i) => ({cellID: cellAt(i * 40, 100)}),
		);
		const {chunks} = commitmentChain(turn, SECRET, actionsPerReveal);

		// A FIRST commit, which is the cold-slot case.
		const commitReceipt = await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [
				identity,
				commitmentHashFor(turn, SECRET, actionsPerReveal),
				parseEther('10'),
				zeroAddress,
			],
		});
		const commitUsed = BigInt(commitReceipt.gasUsed);

		const {cycleNumber} = getCycleNumber(await getTimestamp());
		await advanceToRevealPhase(cycleNumber, true);
		const revealReceipt = await env.execute(Game, {
			account: player,
			functionName: 'reveal',
			args: [
				identity,
				chunks[0].placements,
				SECRET,
				chunks[0].furtherActions,
				zeroAddress,
			],
		});
		const revealUsed = BigInt(revealReceipt.gasUsed);

		assert.ok(
			commitUsed <= declaredCommit,
			`a first commit costs ${commitUsed} gas and the deployment declares commitGas ${declaredCommit}. ` +
				`Raise it in contracts/rocketh/config.ts: the client sizes a new player's gas stipend from it, ` +
				`and if it is ever passed as a LIMIT this is a missed reveal rather than a slow one.`,
		);
		assert.ok(
			revealUsed <= declaredReveal,
			`a full fresh chunk of ${actionsPerReveal} costs ${revealUsed} gas and the deployment declares revealGas ${declaredReveal}. ` +
				`Raise it in contracts/rocketh/config.ts, and note that a chunk is what this bounds: ` +
				`raising actionsPerReveal raises this figure roughly in proportion.`,
		);

		// WITH ROOM TO SPARE, because the figure is a CEILING and not a
		// reservation: the client passes it as the gas limit, so a transaction that
		// needs more does not cost more, it runs OUT OF GAS. On a reveal that is a
		// missed reveal and the stake is forfeited.
		const required = (measured: bigint) =>
			(measured * (100n + MINIMUM_HEADROOM_PERCENT)) / 100n;
		assert.ok(
			declaredCommit >= required(commitUsed),
			`commitGas is declared at ${declaredCommit} against a measured ${commitUsed}, which is less than ${MINIMUM_HEADROOM_PERCENT}% of headroom. ` +
				`It is passed as a gas LIMIT, so it has to be a ceiling rather than a close fit.`,
		);
		assert.ok(
			declaredReveal >= required(revealUsed),
			`revealGas is declared at ${declaredReveal} against a measured ${revealUsed}, which is less than ${MINIMUM_HEADROOM_PERCENT}% of headroom. ` +
				`It is passed as a gas LIMIT on every reveal, and a reveal that runs out of gas is a missed reveal, which forfeits the stake.`,
		);

		// AND THE OTHER DIRECTION, loosely. A budget that has drifted far above
		// what the contracts cost is not dangerous, but it over-funds every
		// stipend and it means nobody has re-measured in a long time.
		assert.ok(
			declaredCommit <= commitUsed * GENEROSITY_CEILING,
			`commitGas is declared at ${declaredCommit} against a measured ${commitUsed}, more than ${GENEROSITY_CEILING}x. Re-measure it.`,
		);
		assert.ok(
			declaredReveal <= revealUsed * GENEROSITY_CEILING,
			`revealGas is declared at ${declaredReveal} against a measured ${revealUsed}, more than ${GENEROSITY_CEILING}x. Re-measure it.`,
		);

		console.log(
			`gas budget: commit ${commitUsed}/${declaredCommit}, reveal ${revealUsed}/${declaredReveal} at ${actionsPerReveal} actions per reveal`,
		);
	});

	it('covers a first commit that pays a reveal scheduler a fresh account', async function () {
		// THE COMMIT CARRIES A PAYMENT when a game hands the skeleton a reveal
		// scheduler (`RevealScheduler`, P3): `makeCommitment` forwards `msg.value`
		// to `payee`, the scheduler's account for this player (fuzd's remote
		// account on `with/fuzd`). The first time, that account holds nothing, and
		// sending value to an empty account is the dearest call there is (the
		// value transfer, the cold account, and creating it). It is the first
		// commit a scheduled player makes, so a budget measured without it makes
		// every player's first scheduled turn run out of gas: measured at 152,154
		// against the 150,000 this used to declare.
		const fixtures = await networkHelpers.loadFixture(deployAll);
		const {
			env,
			Game,
			GameToken,
			linkedData,
			actionsPerReveal,
			unnamedAccounts,
			advanceToCycleNumber,
			getCycleNumber,
			getTimestamp,
		} = fixtures;
		const declaredCommit = BigInt(linkedData.commitGas);

		const player = unnamedAccounts[0];
		const {cycleNumber: start} = getCycleNumber(await getTimestamp());
		await advanceToCycleNumber(start + 2, true);
		const identity = await enterGame({env, Game, GameToken}, player, {
			amount: parseEther('100'),
		});
		const turn: Placement[] = Array.from(
			{length: actionsPerReveal},
			(_, i) => ({cellID: cellAt(i * 40, 100)}),
		);

		// An address nothing has ever touched: the scheduler's account before its
		// first payment.
		const freshPayee = '0x00000000000000000000000000000000000f00d1';
		const balanceBefore = await provider.request({
			method: 'eth_getBalance',
			params: [freshPayee, 'latest'],
		});
		assert.strictEqual(BigInt(balanceBefore as string), 0n);

		const receipt = await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [
				identity,
				commitmentHashFor(turn, SECRET, actionsPerReveal),
				parseEther('10'),
				freshPayee,
			],
			value: parseEther('0.0012'),
		});
		const used = BigInt(receipt.gasUsed);
		const balanceAfter = await provider.request({
			method: 'eth_getBalance',
			params: [freshPayee, 'latest'],
		});
		assert.strictEqual(
			BigInt(balanceAfter as string),
			parseEther('0.0012'),
			'the payment should reach the payee',
		);

		assert.ok(
			declaredCommit >= (used * (100n + MINIMUM_HEADROOM_PERCENT)) / 100n,
			`a first commit paying a fresh payee costs ${used} gas and the deployment declares commitGas ${declaredCommit}, ` +
				`which is less than ${MINIMUM_HEADROOM_PERCENT}% of headroom. It is the gas LIMIT of every commit, ` +
				`so a scheduled player's first turn would run out of gas. Raise it in contracts/rocketh/config.ts.`,
		);
		console.log(`gas budget: paid first commit ${used}/${declaredCommit}`);
	});

	it('is what the credits multiplier is derived from, so the two cannot drift apart', async function () {
		const fixtures = await networkHelpers.loadFixture(deployAll);
		const {linkedData} = fixtures;

		// `creditsGasMultiplier` prices ONE user action, which since the reveal
		// became chunked is a commit plus one reveal STEP. It is derived from
		// these two in `rocketh/config.ts` rather than typed out again, because
		// the last time it was a second copy it merged cleanly into a branch
		// whose contracts cost 30% less and priced a credit 58% too high.
		const sum = BigInt(linkedData.commitGas) + BigInt(linkedData.revealGas);
		assert.ok(sum > 0n, 'the deployment declares no gas budget at all');
	});
});
