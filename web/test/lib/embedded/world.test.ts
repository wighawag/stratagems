import {describe, it, expect, afterEach} from 'vitest';
import {createContext} from '$lib/context/index';
import {createEmbeddedWorld, type EmbeddedWorld} from '$lib/embedded';
import buildTimeDeployments from '$lib/deployments';
import {config, extensions} from 'stratagems-contracts/rocketh/config.js';
import {
	OFFLINE_DEPLOYMENT,
	stakeForEveryoneInTheWorld,
	stakeForOfflinePlayer,
} from '$lib/offline';
import {
	MOST_SEATS,
	SEATS_BY_DEFAULT,
	seatsPlayedByTheWorld,
	tableOf,
} from '$lib/game/lobby/seats';
import {resolveStratagemsConfig} from '$lib/stratagems/game-config';

// No `.svelte.` infix, so this runs in the `server` project: node, no DOM, and
// webevm's core runs there, so a WHOLE WORLD (a chain, stratagems' real deploy,
// a context built on both) is testable without a browser.
//
// STRATAGEMS' OWN, AT THE TEMPLATE'S PATH (step O, P10, of
// work/plans/join-template-commit-reveal.md), as reveal-or-die's is. What it
// asserts is what this game decides: the policy read back as `manual` with
// every gas figure untouched, every seat at the table staked and waited for
// (counted off `getAttendance`, not the table), and a restore that does not
// restake. The context half is the template's: the world's chain id differs
// from the generated `$lib/deployments`', so a context that fell back to the
// build-time chain fails every assertion.

const CHAIN_ID = 9007199254740123;
const DEPLOYER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const BENEFICIARY_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
// The human: neither payer, nor any seat the world plays (those are hardhat's
// development accounts from the third on, `$lib/game/lobby/seats`), as the
// world's generated wallet is not.
const HUMAN = '0x00000000000000000000000000000000000a11ce' as const;

let world: EmbeddedWorld | undefined;
afterEach(async () => {
	await world?.dispose();
	world = undefined;
});

type Provision = Parameters<typeof createEmbeddedWorld>[0]['provision'];

async function buildWorld(overrides?: {provision?: Provision}) {
	return createEmbeddedWorld({
		chainId: CHAIN_ID,
		chain: {
			name: 'Offline',
			nativeCurrency: {name: 'Ether', symbol: 'ETH', decimals: 18},
			properties: {...config.chains[31337].properties},
		},
		rocketh: {config: config as never, extensions},
		environment: OFFLINE_DEPLOYMENT.environment,
		scripts: [...OFFLINE_DEPLOYMENT.scripts],
		accounts: {...OFFLINE_DEPLOYMENT.accounts},
		initialBalances: {...OFFLINE_DEPLOYMENT.initialBalances},
		...(overrides?.provision ? {provision: overrides.provision} : {}),
	});
}

function reader(w: EmbeddedWorld) {
	return (
		w.env as unknown as {
			read: (deployment: unknown, args: unknown) => Promise<unknown>;
		}
	).read;
}

describe('stratagems\u2019 offline world', () => {
	it('boots a chain and runs the game\u2019s real deploy scripts on it, with no Time contract', async () => {
		world = await buildWorld();
		const inTab = world.deployments.get();
		expect(inTab.chain.id).toBe(CHAIN_ID);
		expect(inTab.chain.id).not.toBe(buildTimeDeployments.chain.id);

		const contracts = inTab.contracts as unknown as Record<
			string,
			{address: `0x${string}`} | undefined
		>;
		for (const name of [
			'Stratagems',
			'TestTokens',
			'TestTokensDistributor',
			'Gems',
			'GemsGenerator',
		]) {
			const code = await world.provider.request({
				method: 'eth_getCode',
				params: [contracts[name]!.address, 'latest'],
			});
			expect(code, name).toMatch(/^0x[0-9a-f]{2,}$/);
		}
		// the Manual policy reads no clock, and no local deploy has one
		expect(contracts.Time).toBeUndefined();

		const chainId = await world.provider.request({method: 'eth_chainId'});
		expect(BigInt(chainId as string)).toBe(BigInt(CHAIN_ID));
	});

	it('declares the MANUAL cycle policy, with no clock and nothing else changed', async () => {
		world = await buildWorld();
		const offline = resolveStratagemsConfig(world.deployments.get() as never);
		expect(offline.cycle.policy).toBe('manual');
		expect(offline.cycle.commitPhaseDuration).toBe(0);
		expect(offline.cycle.revealPhaseDuration).toBe(0);

		// everything measured against these contracts is the build-time deploy's
		const onNode = resolveStratagemsConfig(buildTimeDeployments as never);
		expect(offline.gas).toEqual(onNode.gas);
		expect(offline.actionsPerReveal).toBe(onNode.actionsPerReveal);
		expect(offline.expectedActionsPerTurn).toBe(onNode.expectedActionsPerTurn);
		expect(offline.numTokensPerGems).toBe(onNode.numTokensPerGems);
		expect(offline.stakeAmount).toBe(onNode.stakeAmount);
		expect(offline.maxLife).toBe(onNode.maxLife);
	});

	it('gives the context the world it was handed, member for member', async () => {
		world = await buildWorld();
		const {context} = createContext({
			establishConnection: world.establishConnection,
		});
		expect(context.deployments).toBe(world.deployments);
		expect(context.deployments.get().chain.id).toBe(CHAIN_ID);
		expect(context.publicClient.chain?.id).toBe(CHAIN_ID);
	});

	it('reads the chain in the tab through the context\u2019s own client', async () => {
		world = await buildWorld();
		const {context} = createContext({
			establishConnection: world.establishConnection,
		});
		await expect(
			context.publicClient.getCode({
				address: world.deployments.get().contracts.Stratagems.address,
			}),
		).resolves.toMatch(/^0x[0-9a-f]+$/);
		await expect(context.publicClient.getChainId()).resolves.toBe(CHAIN_ID);
	});

	it('stakes one chunk of gems for the player, paid by the tokens\u2019 beneficiary', async () => {
		let stakedDuringProvision = false;
		world = await buildWorld({
			provision: async ({env, accounts}) => {
				expect(accounts.deployer).toBe(OFFLINE_DEPLOYMENT.accounts.deployer);
				await stakeForOfflinePlayer({env, player: HUMAN});
				stakedDuringProvision = true;
			},
		});
		expect(stakedDuringProvision).toBe(true);

		const read = reader(world);
		const deployments = world.deployments.get();
		const {stakeAmount} = resolveStratagemsConfig(deployments as never);
		expect(stakeAmount).toBe(32n * 10n ** 18n);
		expect(
			await read(deployments.contracts.Stratagems, {
				functionName: 'getReserve',
				args: [BigInt(HUMAN)],
			}),
		).toBe(stakeAmount);
		// credited to the player, not to whoever paid
		for (const payer of [DEPLOYER_ADDRESS, BENEFICIARY_ADDRESS]) {
			expect(
				await read(deployments.contracts.Stratagems, {
					functionName: 'getReserve',
					args: [BigInt(payer)],
				}),
				payer,
			).toBe(0n);
		}
		// and the player's wallet was not touched: the beneficiary's gems paid
		expect(
			await read(deployments.contracts.TestTokens, {
				functionName: 'balanceOf',
				args: [HUMAN],
			}),
		).toBe(0n);
	});

	/**
	 * Every seat staked and WAITED FOR: the count is read off `getAttendance`,
	 * which is what the contract blocks the cycle on, not off the table, which is
	 * a list this code built.
	 */
	async function stakesEverySeat(seats: number) {
		const table = tableOf(seats);
		world = await buildWorld({
			provision: async ({env}) => {
				await stakeForEveryoneInTheWorld({env, player: HUMAN, table});
			},
		});
		const read = reader(world);
		const deployments = world.deployments.get();
		const {stakeAmount} = resolveStratagemsConfig(deployments as never);

		const attendance = (await read(deployments.contracts.Stratagems, {
			functionName: 'getAttendance',
		})) as {waitedFor: bigint};
		expect(attendance.waitedFor).toBe(BigInt(seats));

		for (const played of seatsPlayedByTheWorld(table)) {
			expect(
				await read(deployments.contracts.Stratagems, {
					functionName: 'getReserve',
					args: [BigInt(played.address)],
				}),
				played.address,
			).toBe(stakeAmount);
		}
	}

	it('stakes every seat at the table, because a cycle with one member hides nothing', async () => {
		await stakesEverySeat(SEATS_BY_DEFAULT);
	});

	it('waits for exactly the table it was asked for, at a count that is not the default', async () => {
		expect(MOST_SEATS).toBeGreaterThan(SEATS_BY_DEFAULT);
		await stakesEverySeat(MOST_SEATS);
	}, 60_000);

	it('does NOT hand out a second stake when the world is restored', async () => {
		world = await buildWorld({
			provision: async ({env}) => {
				await stakeForOfflinePlayer({env, player: HUMAN});
			},
		});
		// twice more, as two more restores would run it
		await stakeForOfflinePlayer({env: world.env, player: HUMAN});
		await stakeForOfflinePlayer({env: world.env, player: HUMAN});

		const deployments = world.deployments.get();
		expect(
			await reader(world)(deployments.contracts.Stratagems, {
				functionName: 'getReserve',
				args: [BigInt(HUMAN)],
			}),
		).toBe(resolveStratagemsConfig(deployments as never).stakeAmount);
	});
});
