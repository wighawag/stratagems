/**
 * THE DECLARED GAS BUDGET IS A CLAIM ABOUT THESE CONTRACTS, so these contracts
 * are what checks it (the template's `GasBudget.test.ts`, for stratagems' game).
 *
 * `commitGas` and `revealGas` (`deploy/.config/gas.ts`) are recorded in the
 * Stratagems deployment's `linkedData` and the client passes them as the gas
 * LIMIT of every commit and every reveal chunk. A reveal that needs more runs out
 * of gas, which is a missed reveal and the bond, so the figures must cover the
 * worst case with room to spare; and they must not drift so far above it that
 * nobody has measured in a long time.
 *
 * THE WORST CASE MEASURED: the first commit a player makes (every slot cold), and
 * a full chunk of `actionsPerReveal` (32) placements, each on an empty cell with
 * four living neighbours of four other players in enemy colours, every
 * neighbourhood its own so no slot is warm: each move updates four cells, their
 * owners' points, and its own. NOT MEASURED, and a finding for the deployment
 * step: neighbours that die in the reveal's own cycle, whose share is paid out
 * then (token transfers to the owners at the cycle's start).
 */
import {expect, describe, it} from 'vitest';
import {encodeAbiParameters, keccak256, parseEther, zeroAddress} from 'viem';
import {Color, xyToBigIntID, zeroBytes24} from 'stratagems-common';
import {getConnection, loadFixture} from '../utils/connection.js';
import {deployStratagemsWithTestConfig} from './utils/stratagems-test.js';
import {CLIENT_GAS} from '../deploy/.config/gas.js';

type Move = {position: bigint; color: Color};

const SECRET = '0x00000000000000000000000000000000000000000000000000000000000000a1';
const MINIMUM_HEADROOM_PERCENT = 10n;
const GENEROSITY_CEILING = 3n;

function hashOf(moves: Move[]): `0x${string}` {
	return keccak256(
		encodeAbiParameters(
			[
				{type: 'bytes32'},
				{
					type: 'tuple[]',
					components: [
						{name: 'position', type: 'uint64'},
						{name: 'color', type: 'uint8'},
					],
				},
				{type: 'bytes24'},
			],
			[SECRET, moves, zeroBytes24],
		),
	).slice(0, 50) as `0x${string}`;
}

describe('the declared gas budget', function () {
	it('covers the worst commit and the worst reveal chunk', async function () {
		const env = await loadFixture(deployStratagemsWithTestConfig);
		const {publicClient} = await getConnection();
		const S = env.Stratagems as any;
		const chunk = Number(env.config.actionsPerReveal);

		const player = env.otherAccounts[4];
		const neighbourOwners = env.otherAccounts.slice(0, 4);
		const enemies = [Color.Red, Color.Green, Color.Yellow, Color.Purple];

		// `chunk` empty cells, four apart, each ringed by four living enemy cells of
		// four other players: no two moves share a neighbour.
		const moves: Move[] = [];
		const ring = [];
		for (let i = 0; i < chunk; i++) {
			const x = (i % 8) * 4;
			const y = Math.floor(i / 8) * 4;
			moves.push({position: xyToBigIntID(x, y), color: Color.Blue});
			const around = [
				[x, y - 1],
				[x + 1, y],
				[x, y + 1],
				[x - 1, y],
			];
			around.forEach(([nx, ny], k) =>
				ring.push({position: xyToBigIntID(nx, ny), owner: neighbourOwners[k], color: enemies[k], life: 3, stake: 1}),
			);
		}
		await env.TestTokens.write.transfer([env.stratagemsAdmin, parseEther(`${ring.length}`)], {
			account: env.tokensBeneficiary,
		});
		await env.TestTokens.write.approve([env.Stratagems.address, parseEther('100000')], {account: env.stratagemsAdmin});
		for (let i = 0; i < ring.length; i += 32) {
			await S.write.forceSimpleCells([ring.slice(i, i + 32)], {account: env.stratagemsAdmin});
		}

		// a reserve, as the wallet adds it, then the first commit (cold)
		await env.TestTokens.write.transfer([player, parseEther('100')], {account: env.tokensBeneficiary});
		await S.write.addToReserve([BigInt(player), parseEther('100')], {account: player});
		const commitHash = await S.write.makeCommitment([BigInt(player), hashOf(moves), parseEther(`${chunk}`), zeroAddress], {
			account: player,
		});
		const commitUsed = (await publicClient.getTransactionReceipt({hash: commitHash})).gasUsed;

		await env.Time.write.increaseTime([env.config.commitPhaseDuration], {account: env.stratagemsAdmin});
		const revealHash = await S.write.reveal([BigInt(player), moves, SECRET, zeroBytes24, zeroAddress], {
			account: env.stratagemsAdmin,
			gas: 16_000_000n,
		});
		const revealReceipt = await publicClient.getTransactionReceipt({hash: revealHash});
		expect(revealReceipt.status).to.equal('success');
		const revealUsed = revealReceipt.gasUsed;

		// every move placed: the chunk measured is the one that resolves
		const cells = await S.read.getCells([moves.map((m) => m.position)]);
		for (const cell of cells) expect(Number(cell.color)).to.equal(Color.Blue);

		console.log(`gas: first commit ${commitUsed}, a chunk of ${chunk} placements ${revealUsed}`);

		for (const [name, used, declared] of [
			['commitGas', commitUsed, CLIENT_GAS.commitGas],
			['revealGas', revealUsed, CLIENT_GAS.revealGas],
		] as const) {
			expect(
				used * (100n + MINIMUM_HEADROOM_PERCENT) <= declared * 100n,
				`${name}: measured ${used}, declared ${declared}, which is less than ${MINIMUM_HEADROOM_PERCENT}% above it. ` +
					`Raise it in contracts/deploy/.config/gas.ts with the new measurement: it is the gas limit the client sends.`,
			).to.equal(true);
			expect(
				declared <= used * GENEROSITY_CEILING,
				`${name}: declared ${declared} is more than ${GENEROSITY_CEILING}x the measured ${used}; measure again and lower it.`,
			).to.equal(true);
		}
	});
});
