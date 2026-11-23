import {expect} from 'earl';
import {describe, it} from 'node:test'; // using node:test as hardhat v3 do not support vitest
import {network} from 'hardhat';
import {setupFixtures, idOf} from './utils/index.js';
import {zeroAddress} from 'viem';

const {provider, networkHelpers} = await network.create();
const {deployAll} = setupFixtures(provider);

/**
 * Getting set up to play, in one transaction.
 *
 * The client rail above this contract is what a player actually meets, and the
 * property it depends on is here: ONE call both puts a stake at risk and funds
 * the local key that will spend it. If those come apart, the rail is two
 * transactions again and the second one is sent from a wallet the first just
 * spent down.
 */

function saleConfig(StakeSale: {linkedData?: unknown}) {
	const data = StakeSale.linkedData as {price: string; amount: string};
	return {price: BigInt(data.price), amount: BigInt(data.amount)};
}

async function balanceOf(
	provider: {request: (args: {method: string; params: unknown[]}) => unknown},
	address: `0x${string}`,
): Promise<bigint> {
	return BigInt(
		(await provider.request({
			method: 'eth_getBalance',
			params: [address, 'latest'],
		})) as string,
	);
}

describe('StakeSale', function () {
	it('stakes for the player AND funds their play key, in one call', async function () {
		const {env, Game, StakeSale, unnamedAccounts} =
			await networkHelpers.loadFixture(deployAll);

		const {price, amount} = saleConfig(StakeSale);
		const payer = unnamedAccounts[0];
		const signer = unnamedAccounts[1];
		const stipend = 12345n;

		const reserveBefore = (await env.read(Game, {
			functionName: 'getReserve',
			args: [idOf(payer)],
		})) as bigint;
		const signerBefore = await balanceOf(provider, signer);

		await env.execute(StakeSale, {
			account: payer,
			functionName: 'purchase',
			args: [payer, signer, stipend],
			value: price + stipend,
		});

		// BOTH, from one transaction. Asserting only the reserve would pass with
		// the stipend silently kept by the sale, which is the failure that leaves
		// a player staked and unable to move.
		expect(
			(await env.read(Game, {
				functionName: 'getReserve',
				args: [idOf(payer)],
			})) as bigint,
		).toEqual(reserveBefore + amount);
		expect(await balanceOf(provider, signer)).toEqual(signerBefore + stipend);
	});

	it('credits the PLAYER while somebody else pays', async function () {
		// The case an account with no wallet of its own depends on: it cannot send
		// anything, so somebody else's wallet sets it up. Only the player's own
		// reserve may grow, or "pay for a friend" would quietly stake the payer.
		const {env, Game, StakeSale, unnamedAccounts} =
			await networkHelpers.loadFixture(deployAll);

		const {price, amount} = saleConfig(StakeSale);
		const payer = unnamedAccounts[2];
		const player = unnamedAccounts[3];

		const payerBefore = (await env.read(Game, {
			functionName: 'getReserve',
			args: [idOf(payer)],
		})) as bigint;
		const playerBefore = (await env.read(Game, {
			functionName: 'getReserve',
			args: [idOf(player)],
		})) as bigint;

		await env.execute(StakeSale, {
			account: payer,
			functionName: 'purchase',
			args: [player, zeroAddress, 0n],
			value: price,
		});

		expect(
			(await env.read(Game, {
				functionName: 'getReserve',
				args: [idOf(player)],
			})) as bigint,
		).toEqual(playerBefore + amount);
		expect(
			(await env.read(Game, {
				functionName: 'getReserve',
				args: [idOf(payer)],
			})) as bigint,
		).toEqual(payerBefore);
	});

	it('refuses a value that is not the price plus what it forwards', async function () {
		// The check is EXACT in both directions, and each direction is a real
		// client bug: sizing the value from the price alone leaves the stipend
		// taken out of the payment, and sending price plus stipend while naming
		// nobody to forward it to would leave the stipend stuck in the sale.
		const {env, StakeSale, unnamedAccounts} =
			await networkHelpers.loadFixture(deployAll);

		const {price} = saleConfig(StakeSale);
		const payer = unnamedAccounts[4];
		const signer = unnamedAccounts[5];
		const stipend = 1000n;

		await expect(
			env.execute(StakeSale, {
				account: payer,
				functionName: 'purchase',
				args: [payer, signer, stipend],
				value: price,
			}),
		).toBeRejected();

		await expect(
			env.execute(StakeSale, {
				account: payer,
				functionName: 'purchase',
				args: [payer, zeroAddress, 0n],
				value: price + stipend,
			}),
		).toBeRejected();

		// A stipend with nowhere to go is refused rather than kept.
		await expect(
			env.execute(StakeSale, {
				account: payer,
				functionName: 'purchase',
				args: [payer, zeroAddress, stipend],
				value: price + stipend,
			}),
		).toBeRejected();
	});

	it('leaves the stake usable: it can be bonded to a commitment', async function () {
		// The reserve is only worth crediting if the game will accept it. Reading
		// `getReserve` alone would pass with tokens the game never received, since
		// the mapping and the token balance are written by different calls.
		const {
			env,
			Game,
			StakeSale,
			unnamedAccounts,
			advanceToCycleNumber,
			getCycleNumber,
			getTimestamp,
		} = await networkHelpers.loadFixture(deployAll);

		const {price, amount} = saleConfig(StakeSale);
		const player = unnamedAccounts[6];
		const {cycleNumber: startCycleNumber} = getCycleNumber(
			await getTimestamp(),
		);
		await advanceToCycleNumber(startCycleNumber + 2, true);

		await env.execute(StakeSale, {
			account: player,
			functionName: 'purchase',
			args: [player, zeroAddress, 0n],
			value: price,
		});

		await env.execute(Game, {
			account: player,
			functionName: 'makeCommitment',
			args: [
				0n,
				'0x000000000000000000000000000000000000000000000001',
				amount,
				zeroAddress,
			],
		});

		// Bonded to the commitment, so it cannot be taken back out.
		await expect(
			env.execute(Game, {
				account: player,
				functionName: 'withdrawFromReserve',
				args: [amount],
			}),
		).toBeRejected();
	});
});
