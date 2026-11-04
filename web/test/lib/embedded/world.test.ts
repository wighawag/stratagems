import {describe, it, expect, afterEach} from 'vitest';
import {createContext} from '$lib/context/index';
import {createEmbeddedWorld, type EmbeddedWorld} from '$lib/embedded';
import buildTimeDeployments from '$lib/deployments';
import {
	config,
	extensions,
} from 'template-commit-reveal-contracts/rocketh/config.js';
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
import {resolvePlacementConfig} from '$lib/placement/config';

// No `.svelte.` infix, so this runs in the `server` project: node, no DOM.
// That is not a compromise, it is the harness this deserves - webevm's core
// runs under node, so a WHOLE WORLD (a chain, a real deploy, a context built on
// both) is testable without a browser.
//
// PORTED FROM THE STEM, where it deployed a greetings registry, and the port is
// the point rather than the provenance. `createContext({establishConnection})`
// has had exactly one caller in THIS repo since the parameter landed, and it
// was the test asserting that core does not reach for the remote connection
// behind the parameter's back. With one world that test cannot tell a context
// describing the world it was given from one describing the app's build-time
// chain, because they are the same. Here they are not: the chain id, the
// contract addresses and the records all differ from the generated
// `$lib/deployments`, so every assertion below fails if the context quietly
// falls back.
//
// AND WHAT IT DEPLOYS IS THIS GAME'S OWN OFFLINE DEPLOYMENT, not a copy of it.
// The mechanism is already covered by the four suites beside this one; what was
// untested is the DATA - a manual cycle policy with both phase durations zero,
// with everything measured against these contracts left alone.

const CHAIN_ID = 9007199254740123;
const DEPLOYER_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

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
		rocketh: {config, extensions},
		environment: OFFLINE_DEPLOYMENT.environment,
		scripts: [...OFFLINE_DEPLOYMENT.scripts],
		data: {...OFFLINE_DEPLOYMENT.data},
		accounts: {...OFFLINE_DEPLOYMENT.accounts},
		initialBalances: {...OFFLINE_DEPLOYMENT.initialBalances},
		...(overrides?.provision ? {provision: overrides.provision} : {}),
	});
}

describe('this game\u2019s offline world', () => {
	it('boots a chain and runs the game\u2019s real deploy scripts on it', async () => {
		world = await buildWorld();

		// The records come from the deploy that just ran, and the chain they
		// describe is this world's: a MINTED id, which no exporter can emit
		// because the minted range sits above every registered chain.
		const inTab = world.deployments.get();
		expect(inTab.chain.id).toBe(CHAIN_ID);
		expect(inTab.chain.id).not.toBe(buildTimeDeployments.chain.id);
		expect(inTab.contracts.Game.address).toMatch(/^0x[0-9a-fA-F]{40}$/);

		// NOT "at a different ADDRESS from the build-time one", which would be
		// false: the deploy is deterministic (every contract through the CREATE2
		// factory, see "Deterministic deployments" in README.md), so an embedded
		// world lands its contracts at exactly the addresses a fresh local
		// deploy does. What makes these records THIS world's is that the code
		// is there, on this chain.
		for (const name of ['Game', 'GameToken', 'StakeSale'] as const) {
			const code = await world.provider.request({
				method: 'eth_getCode',
				params: [inTab.contracts[name].address, 'latest'],
			});
			expect(code, name).toMatch(/^0x[0-9a-f]{2,}$/);
		}

		const chainId = await world.provider.request({method: 'eth_chainId'});
		expect(BigInt(chainId as string)).toBe(BigInt(CHAIN_ID));
	});

	it('declares the MANUAL cycle policy, with no clock and nothing else changed', async () => {
		// The one decision an offline deployment of this game makes, and the one
		// thing a test of the mechanism could never have caught. `resolvePlacementConfig`
		// is the client's own reader, so this asserts what the GAME will believe
		// rather than what the deploy wrote.
		world = await buildWorld();
		const placement = resolvePlacementConfig(world.deployments.get());

		expect(placement.cycle.policy).toBe('manual');
		// Zero durations and the manual policy are ONE fact: the contract refuses
		// a configuration where they disagree, so a deployment that declared
		// `manual` with a clock would not be here to read.
		expect(placement.cycle.commitPhaseDuration).toBe(0);
		expect(placement.cycle.revealPhaseDuration).toBe(0);

		// Everything measured against THESE CONTRACTS is untouched, because where
		// the chain runs is not one of the things it was measured against: webevm
		// and hardhat agree to the unit on all six readings. A world that restated
		// these would be a second copy of a measurement.
		const onNode = resolvePlacementConfig(buildTimeDeployments as never);
		expect(placement.gas).toEqual(onNode.gas);
		expect(placement.actionsPerReveal).toBe(onNode.actionsPerReveal);
		expect(placement.expectedActionsPerTurn).toBe(
			onNode.expectedActionsPerTurn,
		);
		expect(placement.placementCost).toBe(onNode.placementCost);
	});

	it('gives the context the world it was handed, member for member', async () => {
		world = await buildWorld();
		const {context} = createContext({
			establishConnection: world.establishConnection,
		});

		// Identity, not equivalence. A core that built its own connection would
		// produce a context that behaves identically against one world and points
		// at the wrong chain the moment there are two.
		expect(context.deployments).toBe(world.deployments);
		expect(context.deployments.get().chain.id).toBe(CHAIN_ID);
		expect(context.publicClient.chain?.id).toBe(CHAIN_ID);
	});

	it('reads the chain in the tab through the context\u2019s own client', async () => {
		world = await buildWorld();
		const {context} = createContext({
			establishConnection: world.establishConnection,
		});

		// The end of the chain of trust: a request made through the context
		// reaches the node this world booted. Nothing is mocked between them - the
		// transport wraps the connection's provider, which wraps the node.
		const deployments = world.deployments.get();
		await expect(
			context.publicClient.getCode({
				address: deployments.contracts.Game.address,
			}),
		).resolves.toMatch(/^0x[0-9a-f]+$/);
		await expect(context.publicClient.getChainId()).resolves.toBe(CHAIN_ID);
	});

	it('stakes for the offline player, which is what makes them have to reveal', async () => {
		// THE PROVISIONING SEAM, with this game's answer in it. The framework
		// supplies the moment and the capability; what is at stake is the game's,
		// and here it is a bonded ERC20 bought through the same rail an online
		// purchase uses. A game that gates on custody of an NFT replaces exactly
		// this call.
		const player = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
		let stakedDuringProvision = false;

		world = await buildWorld({
			provision: async ({env, accounts}) => {
				expect(accounts.deployer).toBe(OFFLINE_DEPLOYMENT.accounts.deployer);
				await stakeForOfflinePlayer({env, player});
				stakedDuringProvision = true;
			},
		});

		expect(stakedDuringProvision).toBe(true);

		const deployments = world.deployments.get();
		const reserve = (await (
			world.env as unknown as {
				read: (deployment: unknown, args: unknown) => Promise<bigint>;
			}
		).read(deployments.contracts.Game, {
			functionName: 'getReserve',
			args: [BigInt(player)],
		})) as bigint;

		// The sale's own `amount`, credited to the PLAYER while the DEPLOYER paid:
		// `purchase` takes the player as an argument rather than using msg.sender,
		// which is what lets a world set up an account that has never sent
		// anything.
		expect(reserve).toBe(config.data.sale.default.amount);

		// And the deployer holds none of it, which is the half that would be
		// wrong if the rail credited the payer.
		const payersReserve = (await (
			world.env as unknown as {
				read: (deployment: unknown, args: unknown) => Promise<bigint>;
			}
		).read(deployments.contracts.Game, {
			functionName: 'getReserve',
			args: [BigInt(DEPLOYER_ADDRESS)],
		})) as bigint;
		expect(payersReserve).toBe(0n);
	});

	/**
	 * WHAT PROVISIONING ACTUALLY HANDS OUT, asserted over the TABLE rather than
	 * over the human. A world that enrols ONE waited-for member is not a
	 * commit-reveal game: unanimity is satisfied by the only person present, and
	 * two of the three conditions `advanceCycle` exists to enforce cannot be
	 * reached at all. So the world plays every seat but one, and what makes them
	 * members is precisely this call - `_addToReserve` starts waiting for anyone
	 * holding a funded reserve.
	 *
	 * THE COUNT IS READ OFF `getAttendance`, NOT OFF THE TABLE, and that is the
	 * assertion rather than a detail of it. The table is a list this code built;
	 * `waitedFor` is what the CONTRACT will block the cycle on. A cascade that
	 * quietly halved the seats, or a provisioning loop that skipped one, would
	 * leave a table of N and an attendance of fewer, and only the second number
	 * decides whether the game moves.
	 */
	async function stakesEverySeat(seats: number) {
		const human = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
		const table = tableOf(seats);
		world = await buildWorld({
			provision: async ({env}) => {
				await stakeForEveryoneInTheWorld({env, player: human, table});
			},
		});

		const read = (
			world.env as unknown as {
				read: (deployment: unknown, args: unknown) => Promise<unknown>;
			}
		).read;
		const Game = world.deployments.get().contracts.Game;

		const attendance = (await read(Game, {
			functionName: 'getAttendance',
		})) as {waitedFor: bigint};
		expect(attendance.waitedFor).toBe(BigInt(seats));

		for (const played of seatsPlayedByTheWorld(table)) {
			const reserve = (await read(Game, {
				functionName: 'getReserve',
				args: [BigInt(played.address)],
			})) as bigint;
			expect(reserve, played.address).toBe(config.data.sale.default.amount);
		}
	}

	it('stakes every seat at the table, because a cycle with one member hides nothing', async () => {
		await stakesEverySeat(SEATS_BY_DEFAULT);
	});

	it('waits for exactly the table it was asked for, at a count that is not the default', async () => {
		// A DEFAULT THAT HAPPENS TO WORK PROVES NOTHING ABOUT A PARAMETER. The
		// count only became one when the lobby landed, and the failure it can now
		// have - provisioning the default however many seats were asked for - is
		// invisible to every assertion made at the default.
		//
		// The CEILING specifically, because it is the other end that can be wrong
		// on its own: the world's keys are derived per seat, so the largest table
		// is the one that asks for the last of them.
		expect(MOST_SEATS).toBeGreaterThan(SEATS_BY_DEFAULT);
		await stakesEverySeat(MOST_SEATS);
	}, 60_000);

	it('does NOT hand out a second stake when the world is restored', async () => {
		// A boot is not always a FIRST boot. The chain and the deployment records
		// both persist, so a reload restores the world, skips the deploy, and runs
		// provisioning again. Measured in a browser before this was guarded: a
		// reserve of 10 became 20 on the second load. A stake that can be refilled
		// by pressing F5 is not a stake, and this game's whole design rests on
		// something being lost by not revealing.
		const player = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;
		world = await buildWorld({
			provision: async ({env}) => {
				await stakeForOfflinePlayer({env, player});
			},
		});

		// Twice more, as two more restores would run it.
		await stakeForOfflinePlayer({env: world.env, player});
		await stakeForOfflinePlayer({env: world.env, player});

		const reserve = (await (
			world.env as unknown as {
				read: (deployment: unknown, args: unknown) => Promise<bigint>;
			}
		).read(world.deployments.get().contracts.Game, {
			functionName: 'getReserve',
			args: [BigInt(player)],
		})) as bigint;
		expect(reserve).toBe(config.data.sale.default.amount);
	});
});
