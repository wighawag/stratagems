import {createPublicClient, http, parseAbiItem} from 'viem';
import {expect, type Page} from '@playwright/test';
import {
	authoriseToPlay,
	clearAnyMissedReveal,
	planManyOnCanvas,
	plannedCellIDs,
	stake,
	stakeOnCell,
	submissionStep,
} from './game';

/**
 * The game, as the fuzd suites read it: who plays and signs, the schedule the
 * app stored with the turn, and the chain's record of the turn. Shared by
 * `fuzd.e2e.ts` and `fuzd-fallback.e2e.ts`.
 */

const RPC_URL =
	(globalThis as any).process.env.E2E_RPC_URL ||
	`http://127.0.0.1:${(globalThis as any).process.env.E2E_RPC_PORT || '8545'}`;
export const chain = createPublicClient({transport: http(RPC_URL)});

const COMMITMENT_MADE = parseAbiItem(
	'event CommitmentMade(uint256 indexed player, uint64 indexed cycleNumber, bytes24 commitmentHash, uint256 bond)',
);
const COMMITMENT_REVEALED = parseAbiItem(
	'event CommitmentRevealed(uint256 indexed player, uint64 indexed cycleNumber, bytes24 commitmentHash, bytes24 furtherActions, uint256 cost)',
);

export type Schedule = {
	chainId: string;
	account: string;
	remoteAccount: string;
	slot: string;
	cycleNumber: number;
	batchSize: number;
	revealDueAt: number;
	expiryDelta: number;
	inClear: boolean;
};

/** What the app knows about who plays, who signs, and the game. */
export async function appFacts(page: Page) {
	return page.evaluate(`(() => {
		const read = (store) => {
			let value;
			const stop = store.subscribe((v) => (value = v));
			if (typeof stop === 'function') stop();
			return value;
		};
		const context = globalThis.context;
		const signer = read(context.signerExecutor);
		return {
			identity: read(context.game.activeIdentity),
			signer: signer.status === 'ready' ? signer.address.toLowerCase() : undefined,
			game: context.deployments.get().contracts.Game.address,
			placementCost: context.game.config.placementCost.toString(),
		};
	})()`) as Promise<{
		identity: string;
		signer: string;
		game: `0x${string}`;
		placementCost: string;
	}>;
}

/** The scheduled reveal as the app holds it: the record stored with the turn. */
export async function revealSchedule(page: Page): Promise<
	| {
			cycleNumber: number;
			revealScheduled?: boolean;
			schedule?: Schedule;
			status?: {step: string};
	  }
	| undefined
> {
	return page.evaluate(`(() => {
		let value;
		const stop = globalThis.context.game.revealSchedule.subscribe((v) => (value = v));
		stop();
		return value ? JSON.parse(JSON.stringify(value)) : undefined;
	})()`) as never;
}

export async function missedRevealStep(page: Page): Promise<string> {
	return page.evaluate(`(() => {
		let value;
		const stop = globalThis.context.game.missedReveal.subscribe((v) => (value = v));
		stop();
		return value.step;
	})()`) as Promise<string>;
}

/** The chain's record of one player's turn in one cycle. */
export async function turnOnChain(
	game: `0x${string}`,
	identity: string,
	cycleNumber: number,
) {
	const args = {player: BigInt(identity), cycleNumber: BigInt(cycleNumber)};
	const [made] = await chain.getLogs({
		address: game,
		event: COMMITMENT_MADE,
		args,
		fromBlock: 0n,
	});
	const reveals = await chain.getLogs({
		address: game,
		event: COMMITMENT_REVEALED,
		args,
		fromBlock: 0n,
	});
	reveals.sort((a, b) =>
		a.blockNumber === b.blockNumber
			? a.logIndex - b.logIndex
			: Number(a.blockNumber - b.blockNumber),
	);
	return {made, reveals};
}

/**
 * Stake, plan `count` cells, commit, and wait for the turn to be committed AND
 * scheduled, all inside the commit phase.
 */
export async function commitAScheduledTurn(
	page: Page,
	authoriseBrowser: Parameters<typeof authoriseToPlay>[1],
	count: number,
) {
	await authoriseToPlay(page, authoriseBrowser);
	await clearAnyMissedReveal(page);
	await stake(page);
	await expect
		.poll(async () => (await submissionStep(page)).reserve !== '0', {
			message: 'a reserve to bond from',
			timeout: 60_000,
		})
		.toBe(true);

	await planManyOnCanvas(page, count, 18);
	const cells = await plannedCellIDs(page);
	expect(cells).toHaveLength(count);
	const before = new Map<string, bigint>();
	for (const cellID of cells) {
		before.set(cellID, BigInt(await stakeOnCell(page, cellID)));
	}

	await page.getByRole('button', {name: /commit now/i}).click();
	await expect
		.poll(async () => (await submissionStep(page)).step, {
			message: 'the commitment should reach the chain',
			timeout: 60_000,
		})
		.toBe('Committed');

	const scheduled = await revealSchedule(page);
	expect(
		scheduled?.revealScheduled,
		'the reveal should be scheduled with fuzd',
	).toBe(true);
	const schedule = scheduled!.schedule!;
	const {game} = await appFacts(page);
	expect(schedule.slot, 'one slot per cycle and game').toBe(
		`cycle_${scheduled!.cycleNumber}_${game.toLowerCase()}`,
	);
	expect(schedule.inClear, 'the local chain schedules in clear (P6)').toBe(
		true,
	);
	await expect(page.locator('[data-testid="reveal-schedule"]')).toHaveAttribute(
		'data-step',
		'scheduled',
	);
	await expect(page.locator('[data-testid="reveal-schedule"]')).toContainText(
		/revealed for you/i,
	);
	return {cells, before, schedule, cycleNumber: scheduled!.cycleNumber};
}
