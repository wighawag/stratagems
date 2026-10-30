/**
 * STRATAGEMS' GAME, as its fuzd suites read it (`with/fuzd`, step 8 of
 * work/plans/join-template-commit-reveal.md): the reference game's
 * `fixtures/fuzd-game.ts` (omitted here, it plays that game) for stratagems'
 * move, board and stake. Shared by `stratagems-fuzd.e2e.ts` and
 * `stratagems-fuzd-fallback.e2e.ts`.
 *
 * Read out of the app (`globalThis.context`) and off the chain, never off the
 * screen, except the HUD's reveal-schedule line, which is the claim.
 */
import {createPublicClient, http, parseAbiItem} from 'viem';
import {expect, type Page} from '@playwright/test';
import {gameStep, getTestGems, planMoves, senders, stake} from './stratagems';

const env = (globalThis as any).process.env;
const RPC_URL =
	env.E2E_RPC_URL || `http://127.0.0.1:${env.E2E_RPC_PORT || '8545'}`;
export const chain = createPublicClient({transport: http(RPC_URL)});

const COMMITMENT_MADE = parseAbiItem(
	'event CommitmentMade(uint256 indexed player, uint64 indexed cycleNumber, bytes24 commitmentHash, uint256 bond)',
);
const COMMITMENT_REVEALED = parseAbiItem(
	'event CommitmentRevealed(uint256 indexed player, uint64 indexed cycleNumber, bytes24 commitmentHash, bytes24 furtherActions, uint256 cost)',
);

const READ = `
	const read = (store) => {
		let value;
		const stop = store.subscribe((v) => (value = v));
		if (typeof stop === 'function') stop();
		return value;
	};
`;

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

/** Who plays, who signs (lowercase), and the game's address. */
export async function appFacts(page: Page) {
	const {account, signer} = await senders(page);
	const game = (await page.evaluate(
		'globalThis.context.deployments.get().contracts.Stratagems.address',
	)) as `0x${string}`;
	return {
		identity: account.toLowerCase(),
		signer: signer.toLowerCase(),
		game,
	};
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
		${READ}
		const value = read(globalThis.context.game.revealSchedule);
		return value ? JSON.parse(JSON.stringify(value)) : undefined;
	})()`) as never;
}

export async function missedRevealStep(page: Page): Promise<string> {
	return page.evaluate(`(() => {
		${READ}
		return read(globalThis.context.game.missedReveal).step;
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
	return {made, reveals};
}

/**
 * Test gems, the stake, `count` moves planned on the board, committed, and the
 * turn committed AND scheduled with fuzd, all inside one commit phase (a local
 * cycle is 30 s of commit and 10 s of reveal; the play window the HUD counts
 * down is shorter, so the plan starts with `planMoves`' 15 s left, as the cycle
 * suite's does).
 */
export async function commitAScheduledTurn(page: Page, count: number) {
	await getTestGems(page);
	const reserveBefore = BigInt((await gameStep(page)).reserve ?? '0');
	await stake(page);
	await expect
		.poll(
			async () => BigInt((await gameStep(page)).reserve ?? '0') > reserveBefore,
			{message: 'the reserve should grow', timeout: 60_000},
		)
		.toBe(true);
	await expect(
		page.getByRole('button', {name: /authorise and carry on/i}),
		'the stake lets this browser play',
	).toHaveCount(0, {timeout: 60_000});

	await planMoves(page, count);
	const moves = (await gameStep(page)).moves;
	expect(moves).toHaveLength(count);

	await page.getByRole('button', {name: /commit now/i}).click();
	await expect
		.poll(async () => (await gameStep(page)).step, {
			message: 'the commitment should reach the chain',
			timeout: 60_000,
		})
		.toBe('Committed');

	await expect
		.poll(async () => (await revealSchedule(page))?.revealScheduled, {
			message: 'the reveal should be scheduled with fuzd',
			timeout: 30_000,
		})
		.toBe(true);
	const scheduled = (await revealSchedule(page))!;
	const schedule = scheduled.schedule!;
	const {game} = await appFacts(page);
	expect(schedule.slot, 'one slot per cycle and game').toBe(
		`cycle_${scheduled.cycleNumber}_${game.toLowerCase()}`,
	);
	expect(schedule.inClear, 'the local chain schedules in clear (P6)').toBe(
		true,
	);
	expect(schedule.batchSize, 'a stratagems turn is one chunk').toBe(1);
	await expect(page.locator('[data-testid="reveal-schedule"]')).toHaveAttribute(
		'data-step',
		'scheduled',
	);
	await expect(page.locator('[data-testid="reveal-schedule"]')).toContainText(
		/revealed for you/i,
	);
	return {moves, schedule, cycleNumber: scheduled.cycleNumber};
}
