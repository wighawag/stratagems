/**
 * STRATAGEMS' GAME, as the e2e suite drives it: the reference game's
 * `fixtures/game.ts` (omitted here) for stratagems' move, board and stake.
 *
 * The helpers read state out of the app (`globalThis.context`) rather than off
 * the screen, so an assertion fails on what the game believes rather than on how
 * it rendered.
 */
import {expect, type Page} from '@playwright/test';
import {
	encodeAbiParameters,
	encodeFunctionData,
	erc20Abi,
	keccak256,
	parseAbi,
	parseEther,
} from 'viem';

const env = (globalThis as any).process.env;
const RPC_URL =
	env.E2E_RPC_URL || `http://127.0.0.1:${env.E2E_RPC_PORT || '8545'}`;

/**
 * Who holds the TestTokens on a local deploy: `tokensBeneficiary`, the second
 * account of the test mnemonic (`contracts/rocketh/config.ts`), which the node
 * holds unlocked.
 */
const TOKENS_BENEFICIARY = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

const READ = `
	const read = (store) => {
		let value;
		const stop = store.subscribe((v) => (value = v));
		if (typeof stop === 'function') stop();
		else if (stop && typeof stop.unsubscribe === 'function') stop.unsubscribe();
		return value;
	};
`;

async function rpc(method: string, params: unknown[]): Promise<any> {
	const response = await fetch(RPC_URL, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
	});
	const json = await response.json();
	if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
	return json.result;
}

/**
 * Give the signed-in account gems, from the deploy's token holder, without the
 * UI. The suite gets them through the HUD's "Get test gems" instead
 * (`getTestGems`); this stays for a test that is about something else.
 */
export async function giveGems(page: Page, amount = '100'): Promise<void> {
	const {account, tokens} = (await page.evaluate(`(() => {
		${READ}
		return {
			account: read(globalThis.context.account),
			tokens: globalThis.context.deployments.get().contracts.TestTokens.address,
		};
	})()`)) as {account: `0x${string}`; tokens: `0x${string}`};
	const hash = await rpc('eth_sendTransaction', [
		{
			from: TOKENS_BENEFICIARY,
			to: tokens,
			data: encodeFunctionData({
				abi: erc20Abi,
				functionName: 'transfer',
				args: [account, parseEther(amount)],
			}),
		},
	]);
	await expect
		.poll(
			async () => (await rpc('eth_getTransactionReceipt', [hash]))?.status,
			{
				message: 'the gems should reach the account',
				timeout: 30_000,
			},
		)
		.toBe('0x1');
}

/** The wallet's gems and what a stake takes, as the app reads them. */
export async function gems(
	page: Page,
): Promise<{wallet?: bigint; stake: bigint; perMove: bigint}> {
	const found = (await page.evaluate(`(() => {
		${READ}
		const game = globalThis.context.game;
		const reserve = read(game.reserve);
		return {
			wallet: reserve.step === 'Loaded' ? reserve.tokenBalance.toString() : undefined,
			stake: game.config.stakeAmount.toString(),
			perMove: game.config.numTokensPerGems.toString(),
		};
	})()`)) as {wallet?: string; stake: string; perMove: string};
	return {
		wallet: found.wallet === undefined ? undefined : BigInt(found.wallet),
		stake: BigInt(found.stake),
		perMove: BigInt(found.perMove),
	};
}

/** The gems `address` holds, read off the chain rather than the app. */
export async function walletGems(page: Page, address: string): Promise<bigint> {
	const tokens = (await page.evaluate(
		'globalThis.context.game.config.tokenAddress',
	)) as `0x${string}`;
	return BigInt(
		await rpc('eth_call', [
			{
				to: tokens,
				data: encodeFunctionData({
					abi: erc20Abi,
					functionName: 'balanceOf',
					args: [address as `0x${string}`],
				}),
			},
			'latest',
		]),
	);
}

/**
 * Press the HUD's "Get test gems" (`TestTokensDistributor.topup()`, from the
 * wallet) until the wallet holds enough to stake: a top-up is 15 gems and a
 * stake a whole chunk of 32, so three presses on a fresh account.
 */
export async function getTestGems(page: Page): Promise<number> {
	const button = page.locator('[data-testid="get-test-gems"]');
	let presses = 0;
	for (;;) {
		const {wallet, stake} = await gems(page);
		if (wallet !== undefined && wallet >= stake) return presses;
		if (presses >= 5)
			throw new Error(`still short of a stake after ${presses} top-ups`);
		await expect(button, 'the HUD should offer test gems').toBeEnabled({
			timeout: 30_000,
		});
		await button.click();
		presses++;
		await expect
			.poll(async () => (await gems(page)).wallet ?? 0n, {
				message: 'the top-up should reach the wallet',
				timeout: 60_000,
			})
			.toBeGreaterThan(wallet ?? 0n);
	}
}

export type GameStep = {
	step: string;
	message?: string;
	reserve?: string;
	planned: number;
	moves: {position: string; color: number}[];
	phase: string;
	timeLeft: number;
	account?: string;
};

export async function gameStep(page: Page): Promise<GameStep> {
	return page.evaluate(`(() => {
		${READ}
		const context = globalThis.context;
		const submission = read(context.game.submission);
		const reserve = read(context.game.reserve);
		const phase = read(context.game.threePhase);
		const moves = 'actions' in submission ? submission.actions : [];
		return {
			step: submission.step,
			message: submission.message,
			reserve: reserve.step === 'Loaded' ? reserve.amount.toString() : undefined,
			planned: moves.length,
			moves: moves.map((m) => ({position: m.position.toString(), color: m.color})),
			phase: phase.phase,
			timeLeft: phase.timeLeft,
			account: read(context.account),
		};
	})()`) as Promise<GameStep>;
}

/** A cell as the board (the held view) shows it, or undefined. */
export async function cellOnBoard(
	page: Page,
	position: string,
): Promise<
	{color: number; life: number; owner?: string; planned?: number} | undefined
> {
	return page.evaluate(`(() => {
		${READ}
		const view = read(globalThis.context.viewState);
		if (view.step !== 'Loaded') return undefined;
		const cell = view.cells.get('${position}');
		return cell ? {color: cell.color, life: cell.life, owner: cell.owner, planned: cell.planned} : undefined;
	})()`) as Promise<
		{color: number; life: number; owner?: string; planned?: number} | undefined
	>;
}

/**
 * What the chain says about an address: its balance and how many transactions
 * it has sent (its nonce), which is how a test counts wallet transactions.
 */
export async function onChain(
	address: string,
): Promise<{balance: bigint; sent: number}> {
	const [balance, nonce] = await Promise.all([
		rpc('eth_getBalance', [address, 'latest']),
		rpc('eth_getTransactionCount', [address, 'latest']),
	]);
	return {balance: BigInt(balance), sent: Number(BigInt(nonce))};
}

/** The account that owns, and the browser's key that sends. */
export async function senders(
	page: Page,
): Promise<{account: string; signer: string; stipend: bigint}> {
	const found = (await page.evaluate(`(() => {
		${READ}
		const context = globalThis.context;
		const signer = read(context.signerExecutor);
		return {
			account: read(context.account),
			signer: signer && signer.status === 'ready' ? signer.address : undefined,
			stipend: context.game.config.stipend.toString(),
		};
	})()`)) as {account?: string; signer?: string; stipend: string};
	if (!found.account || !found.signer) throw new Error('not signed in');
	return {
		account: found.account,
		signer: found.signer,
		stipend: BigInt(found.stipend),
	};
}

/** Press the stake button and answer what the rail asks. */
export async function stake(page: Page): Promise<void> {
	const deposit = page.locator('[data-testid="acquire-stake"]');
	if (await deposit.isVisible({timeout: 10_000}).catch(() => false)) {
		await deposit.click();
	} else {
		await page.locator('[data-testid="acquire-more-stake"]').click();
	}
	const chooser = page.locator('[data-testid="acquire-payment-methods"]');
	if (await chooser.isVisible({timeout: 10_000}).catch(() => false)) {
		await page
			.locator('[data-testid="acquire-pay-with-account"]')
			.or(page.locator('[data-testid="acquire-pay-with-wallet"]'))
			.first()
			.click({timeout: 30_000});
	}
	const consent = page.getByRole('button', {name: /^(sign and buy|buy)$/i});
	if (await consent.isVisible({timeout: 10_000}).catch(() => false)) {
		await consent.click({timeout: 30_000});
	}
}

/** Let this browser play as the account, if the setup gate asks. */
export async function authoriseToPlay(
	page: Page,
	authoriseBrowser: (page: Page, options?: {via?: string}) => Promise<unknown>,
): Promise<void> {
	const button = page.getByRole('button', {name: /authorise and carry on/i});
	if (!(await button.isVisible({timeout: 10_000}).catch(() => false))) return;
	await button.click();
	await authoriseBrowser(page);
	await expect(button, 'authorising should let the board move on').toBeHidden({
		timeout: 60_000,
	});
}

export async function clickCanvas(
	page: Page,
	offset: {x: number; y: number},
): Promise<void> {
	const box = await page.locator('canvas').boundingBox();
	if (!box) throw new Error('the canvas has no layout box');
	await page.mouse.click(
		box.x + box.width / 2 + offset.x,
		box.y + box.height / 2 + offset.y,
	);
}

/** Click the middle of the cell at x,y, through the app's own camera. */
export async function clickCell(
	page: Page,
	cell: {x: number; y: number},
): Promise<void> {
	const offset = (await page.evaluate(`(() => {
		const {transform} = globalThis.context.render.cameraControl.current;
		return {
			x: (${cell.x} - transform.centerX) * transform.scale,
			y: (${cell.y} - transform.centerY) * transform.scale,
		};
	})()`)) as {x: number; y: number};
	await clickCanvas(page, offset);
}

/** A cell's packed position, as `stratagems-common`'s `xyToBigIntID`. */
export function positionOf(cell: {x: number; y: number}): bigint {
	return (
		(BigInt.asUintN(32, BigInt(cell.y)) << 32n) +
		BigInt.asUintN(32, BigInt(cell.x))
	);
}

/** The x,y of a packed position. */
export function cellOf(position: string | bigint): {x: number; y: number} {
	const p = BigInt(position);
	return {
		x: Number(BigInt.asIntN(32, p & 0xffffffffn)),
		y: Number(BigInt.asIntN(32, p >> 32n)),
	};
}

/** The cell the HUD's cell panel describes, read off the screen. */
export function cellPanel(page: Page) {
	return page.locator('[data-testid="cell-panel"]');
}

const STRATAGEMS_ABI = parseAbi([
	'function makeCommitmentWithExtraReserve(uint256 player, bytes24 commitmentHash, uint256 bond, uint256 tokensAmountToAdd, address payee) payable',
	'function reveal(uint256 player, (uint64 position, uint8 color)[] moves, bytes32 secret, bytes24 furtherActions, address payee) payable',
]);
const ZERO_BYTES24 = `0x${'00'.repeat(24)}` as const;
const ZERO_ADDRESS = `0x${'00'.repeat(20)}` as const;

async function send(from: string, to: string, data: `0x${string}`) {
	const hash = await rpc('eth_sendTransaction', [{from, to, data}]);
	await expect
		.poll(
			async () => (await rpc('eth_getTransactionReceipt', [hash]))?.status,
			{message: `the rival's transaction should land`, timeout: 30_000},
		)
		.toBe('0x1');
}

/**
 * ANOTHER PLAYER, played straight against the contract from the deploy's token
 * holder (unlocked on the node): commit one move now, in the commit phase the
 * page is in, and return the reveal to send once the reveal phase opens. The
 * move is hashed in the base's one encoding (`common/`'s `prepareCommitment`).
 */
export async function rivalCommits(
	page: Page,
	cell: {x: number; y: number; color: number},
): Promise<{reveal: () => Promise<void>; player: string}> {
	const {game, perMove} = (await page.evaluate(`(() => ({
		game: globalThis.context.deployments.get().contracts.Stratagems.address,
		perMove: globalThis.context.game.config.numTokensPerGems.toString(),
	}))()`)) as {game: `0x${string}`; perMove: string};
	const player = BigInt(TOKENS_BENEFICIARY);
	const moves = [{position: positionOf(cell), color: cell.color}];
	const secret = keccak256(
		encodeAbiParameters([{type: 'string'}], [`rival ${Date.now()}`]),
	);
	const hash = keccak256(
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
			[secret, moves, ZERO_BYTES24],
		),
	).slice(0, 50) as `0x${string}`;
	await send(
		TOKENS_BENEFICIARY,
		game,
		encodeFunctionData({
			abi: STRATAGEMS_ABI,
			functionName: 'makeCommitmentWithExtraReserve',
			args: [player, hash, BigInt(perMove), BigInt(perMove), ZERO_ADDRESS],
		}),
	);
	return {
		player: TOKENS_BENEFICIARY.toLowerCase(),
		reveal: () =>
			send(
				TOKENS_BENEFICIARY,
				game,
				encodeFunctionData({
					abi: STRATAGEMS_ABI,
					functionName: 'reveal',
					args: [player, moves, secret, ZERO_BYTES24, ZERO_ADDRESS],
				}),
			),
	};
}

/**
 * Cells around the middle, far enough apart (more than a cell at the initial
 * zoom) that no two land on one. The chain is shared and reused across runs, so a
 * cell may be another player's living cell, which a click may not plan: the
 * ladder goes on until enough are planned.
 */
const LADDER = [
	{x: 0, y: -90},
	{x: 90, y: 0},
	{x: -90, y: 0},
	{x: 0, y: 90},
	{x: 90, y: -90},
	{x: -90, y: 90},
	{x: 180, y: 0},
	{x: -180, y: 0},
	{x: 0, y: -180},
	{x: 180, y: 180},
	{x: -180, y: -180},
	{x: 180, y: -180},
];

/** Plan `count` moves in one play phase with at least `secondsNeeded` left. */
export async function planMoves(
	page: Page,
	count: number,
	secondsNeeded = 15,
): Promise<void> {
	await expect
		.poll(
			async () => {
				const step = await gameStep(page);
				return step.phase === 'play' && step.timeLeft > secondsNeeded;
			},
			{
				message: `a play phase with at least ${secondsNeeded}s left`,
				timeout: 120_000,
			},
		)
		.toBe(true);
	await expect(page.locator('[role="dialog"]')).toHaveCount(0, {
		timeout: 15_000,
	});
	let planned = (await gameStep(page)).planned;
	for (const offset of LADDER) {
		if (planned >= count) break;
		await clickCanvas(page, offset);
		await page.waitForTimeout(200);
		const now = (await gameStep(page)).planned;
		// a click on a cell already planned takes it back: put it back
		if (now < planned) await clickCanvas(page, offset);
		planned = (await gameStep(page)).planned;
	}
	expect(planned, `should have planned ${count} moves`).toBe(count);
}
