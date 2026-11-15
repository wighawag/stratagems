import {describe, it, expect, afterEach} from 'vitest';
import {createContext} from '$lib/context/index';
import {createEmbeddedWorld, type EmbeddedWorld} from '$lib/embedded';
import buildTimeDeployments from '$lib/deployments';
import {config, extensions} from 'stratagems-contracts/rocketh/config.js';
import {
	OFFLINE_DEPLOYMENT,
	TABLE_STORAGE_KEY,
	stakeForEveryoneAtTheTable,
	stakeForEveryoneInTheWorld,
	stakeForOfflinePlayer,
	tableBoardAt,
} from '$lib/offline';
import {
	MOST_SEATS,
	SEATS_BY_DEFAULT,
	seatsPlayedByTheWorld,
	tableOf,
} from '$lib/game/lobby/seats';
import {resolveStratagemsConfig} from '$lib/stratagems/game-config';
import {createPublicClient, createWalletClient, custom} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {lobby as gameLobby} from '$lib/context/index';
import {TABLE_SEATS} from '$lib/game/lobby/lobby';
import {
	openOfflineTable,
	startOfflineTableOnce,
	type OfflineTableCreator,
} from '$lib/game/lobby/offline-table';
import {readRoster} from '$lib/game/lobby/table';
import {
	encodeStratagemsOptions,
	DEFAULT_TABLE_GAP_PERCENT,
	DEFAULT_TABLE_STAKE_GEMS,
} from '$lib/stratagems/table';

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
/** A second person at this device (hotseat), as the wallet's second account. */
const SECOND_HUMAN = '0x0000000000000000000000000000000000000b0b' as const;

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
		expectedContracts: [...OFFLINE_DEPLOYMENT.expectedContracts],
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

	/**
	 * HOTSEAT (step H2): two people at this device and one seat the world plays,
	 * each person staked as their own account in the world's wallet, and each
	 * only once, since provisioning runs again on every restore.
	 */
	it('stakes every person at this device as their own account, once', async () => {
		const table = tableOf(3, 2);
		const humans = [HUMAN, SECOND_HUMAN] as const;
		world = await buildWorld({
			provision: async ({env}) => {
				await stakeForEveryoneInTheWorld({env, player: HUMAN, humans, table});
			},
		});
		// as a restore runs it again
		await stakeForEveryoneInTheWorld({
			env: world.env,
			player: HUMAN,
			humans,
			table,
		});
		const read = reader(world);
		const deployments = world.deployments.get();
		const {stakeAmount} = resolveStratagemsConfig(deployments as never);

		const attendance = (await read(deployments.contracts.Stratagems, {
			functionName: 'getAttendance',
		})) as {waitedFor: bigint};
		expect(attendance.waitedFor).toBe(3n);
		for (const player of [
			...humans,
			...seatsPlayedByTheWorld(table).map((seat) => seat.address),
		]) {
			expect(
				await read(deployments.contracts.Stratagems, {
					functionName: 'getReserve',
					args: [BigInt(player)],
				}),
				player,
			).toBe(stakeAmount);
		}
	}, 60_000);

	it('refuses a person at this device who has no account to stake for', async () => {
		world = await buildWorld();
		await expect(
			stakeForEveryoneInTheWorld({
				env: world.env,
				player: HUMAN,
				humans: [HUMAN],
				table: tableOf(3, 2),
			}),
		).rejects.toThrow(/no account/);
	});

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

/**
 * A TABLE IN STRATAGEMS' OFFLINE WORLD (step OT2, OT2-1 to OT2-3): the tables
 * deployed on the world's Manual cycle, the world's table created by its first
 * person, every seat staked AT THE TABLE with exactly its stake by the tokens'
 * beneficiary (nobody in the world's `Stratagems`), started by the tab, its
 * address recorded; and a reload that finds it again repeating nothing. The
 * browser's half (the wallet, the context on the table's record, the played
 * seats, the settlement) is the e2e's, `stratagems-offline-table.e2e.ts`.
 */
describe('a table in stratagems\u2019 offline world', () => {
	// the first person: a key of its own, neither a payer nor a seat the world
	// plays (those are hardhat's development accounts from the third on), as
	// the world's generated wallet is not
	const CREATOR_KEY =
		'0x3333333333333333333333333333333333333333333333333333333333333333' as const;
	const CREATOR = {
		privateKey: CREATOR_KEY,
		address: privateKeyToAccount(CREATOR_KEY).address,
	} as const;
	const OPTIONS = encodeStratagemsOptions({
		stakeGems: DEFAULT_TABLE_STAKE_GEMS,
		gapPercent: DEFAULT_TABLE_GAP_PERCENT,
	});
	const seatsOf = () => tableOf(3, 1, [], TABLE_SEATS);

	async function tableWorld() {
		world = await buildWorld({
			provision: async ({node}) => {
				await node.provider.request({
					method: 'evm_setBalance',
					params: [CREATOR.address, `0x${(10n ** 24n).toString(16)}`],
				} as never);
			},
		});
		const records = world.deployments.get();
		const chain = {
			id: records.chain.id,
			name: records.chain.name,
			nativeCurrency: records.chain.nativeCurrency,
			rpcUrls: {default: {http: [] as string[]}},
		};
		const reader = createPublicClient({
			chain,
			transport: custom(world.provider as never),
		});
		const account = privateKeyToAccount(CREATOR.privateKey);
		const client = createWalletClient({
			account,
			chain,
			transport: custom(world.provider as never),
		});
		let sends = 0;
		const creator: OfflineTableCreator = {
			address: CREATOR.address,
			writeContract: (request) => {
				sends++;
				return client.writeContract({
					...request,
					account,
					chain: null,
				} as never);
			},
		};
		const store = new Map<string, string>();
		const storage = {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value),
		};
		/** What the beneficiary has sent: every approve and stake is one. */
		const payerSends = async () =>
			Number(
				BigInt(
					(await world!.provider.request({
						method: 'eth_getTransactionCount',
						params: [BENEFICIARY_ADDRESS, 'latest'],
					})) as string,
				),
			);
		return {
			records,
			reader,
			creator,
			storage,
			store,
			sends: () => sends,
			payerSends,
			factory: gameLobby!.factory(records).address,
			implementation: gameLobby!.implementation(records).address,
		};
	}

	async function boot(
		at: Awaited<ReturnType<typeof tableWorld>>,
		seats = seatsOf(),
	) {
		const opened = await openOfflineTable({
			reader: at.reader as never,
			creator: at.creator,
			factory: at.factory,
			implementation: at.implementation,
			storage: at.storage,
			storageKey: TABLE_STORAGE_KEY,
			seats: seats.length,
			cycles: 2,
			gameOptions: OPTIONS,
		});
		if (opened.kind !== 'table') return {opened, started: false};
		await stakeForEveryoneAtTheTable({
			env: world!.env,
			table: opened.table.address,
			player: CREATOR.address,
			seats,
		});
		const started = await startOfflineTableOnce({
			reader: at.reader as never,
			creator: at.creator,
			table: opened.table.address,
		});
		return {opened, started};
	}

	function tableOn(at: Awaited<ReturnType<typeof tableWorld>>, address: `0x${string}`) {
		return {
			address,
			abi: (
				at.records.contracts as unknown as Record<string, {abi: unknown}>
			).StratagemsTableImplementation.abi,
		};
	}

	it('deploys the tables on the world\u2019s MANUAL cycle', async () => {
		const at = await tableWorld();
		const linked = (
			at.records.contracts as unknown as Record<
				string,
				{linkedData: Record<string, unknown>}
			>
		).StratagemsTableFactory.linkedData;
		expect(Number(linked.cyclePolicy)).toBe(1);
		expect(BigInt(linked.commitPhaseDuration as string)).toBe(0n);
		expect(BigInt(linked.revealPhaseDuration as string)).toBe(0n);
		// and the client reads a table's record as the Manual cycle too
		const atTable = gameLobby!.deploymentsAt(at.records, {
			address: at.factory,
			openedAtBlock: 0,
		} as never);
		const tableConfig = resolveStratagemsConfig(atTable as never);
		expect(tableConfig.cycle.policy).toBe('manual');
	});

	it('creates the table from the first person, stakes every seat AT it with exactly its stake, starts it, and records its address', async () => {
		const at = await tableWorld();
		const seats = seatsOf();
		const {opened, started} = await boot(at, seats);
		expect(opened.kind).toBe('table');
		if (opened.kind !== 'table') return;
		expect(opened.created).toBe(true);
		expect(started).toBe(true);
		expect(at.store.get(TABLE_STORAGE_KEY)).toBe(opened.table.address);

		const roster = await readRoster(at.reader as never, opened.table.address);
		expect(roster.creator.toLowerCase()).toBe(CREATOR.address.toLowerCase());
		expect(roster.started).toBe(true);
		expect(roster.cycles).toBe(2);
		expect(roster.members).toHaveLength(3);

		const read = reader(world!);
		const Table = tableOn(at, opened.table.address);
		const stake = BigInt(DEFAULT_TABLE_STAKE_GEMS) * 10n ** 18n;
		const attendance = (await read(Table, {
			functionName: 'getAttendance',
		})) as {waitedFor: bigint};
		expect(attendance.waitedFor).toBe(3n);
		for (const player of [
			CREATOR.address,
			...seatsPlayedByTheWorld(seats).map((seat) => seat.address),
		]) {
			expect(
				await read(Table, {functionName: 'getReserve', args: [BigInt(player)]}),
				player,
			).toBe(stake);
			// NOBODY IN THE WORLD'S `Stratagems`: a table world stakes at the table
			expect(
				await read(at.records.contracts.Stratagems, {
					functionName: 'getReserve',
					args: [BigInt(player)],
				}),
				player,
			).toBe(0n);
		}
		const inTheWorld = (await read(at.records.contracts.Stratagems, {
			functionName: 'getAttendance',
		})) as {waitedFor: bigint};
		expect(inTheWorld.waitedFor).toBe(0n);

		// the board the played seats are handed: three seats of 10 gems and a
		// 50% gap, 45 cells, a side of 7
		expect(await tableBoardAt(world!.env, opened.table.address)).toEqual({
			min: -3,
			max: 3,
		});
	}, 60_000);

	it('restores the same table on a reload, with no second create, approve, stake or start', async () => {
		const at = await tableWorld();
		const seats = seatsOf();
		const first = await boot(at, seats);
		const sent = at.sends();
		const paid = await at.payerSends();
		// one approve and three stakes
		expect(paid).toBeGreaterThanOrEqual(4);
		const address = (first.opened as {table: {address: `0x${string}`}}).table
			.address;

		const again = await boot(at, seats);
		expect(again.opened).toMatchObject({
			kind: 'table',
			created: false,
			table: {address},
		});
		expect(again.started).toBe(false);
		expect(at.sends()).toBe(sent);
		expect(await at.payerSends()).toBe(paid);
		const games = (await at.reader.readContract({
			address: at.factory,
			abi: (
				at.records.contracts as unknown as Record<string, {abi: unknown}>
			).StratagemsTableFactory.abi as never,
			functionName: 'numGames' as never,
		})) as bigint;
		expect(games).toBe(1n);
	}, 60_000);

	it('refuses a stored table the chain does not hold', async () => {
		const at = await tableWorld();
		at.store.set(
			TABLE_STORAGE_KEY,
			'0x00000000000000000000000000000000000000aa',
		);
		const {opened} = await boot(at);
		expect(opened.kind).toBe('incoherent');
		expect(at.sends()).toBe(0);
	});
});
