/**
 * THE BROWSER CHECK OF THE PORT: a tab that starts from the publication lands on
 * the same state as a tab that indexed alpha1 itself, and both land on the oracle.
 *
 *   pnpm indexer:index alpha1                       # fold + publish into static/indexed-states/alpha1
 *   MODE=alpha1 pnpm --filter ./web build           # the app, with the publication embedded
 *   VERIFY_ETH_NODE=<url> pnpm --filter ./web verify:alpha1
 *
 * Two copies of `build/` are served on two origins (so two separate IndexedDB):
 *
 * - FROM-PUBLICATION serves it as built: the worker finds `publication.json`, installs
 *   the snapshot of its own bundle and indexes forward from its cut.
 * - SELF-INDEXED answers 404 under `indexed-states/`: no publication, so the worker
 *   indexes alpha1 from its start block (12,082,311) to the tip.
 *
 * Both read the chain through `?ethnode=` (`VERIFY_ETH_NODE`), the app's own
 * fallback node, so no wallet is involved. Over a public node capped at 2,000
 * blocks per `eth_getLogs` the self-indexed tab takes hours; point it at
 * `indexer/oracle/2026-09-29-alpha1/rpc-cache-proxy.ts`, which serves wide ranges
 * from the logs `pnpm indexer:index alpha1` already fetched through it.
 */
import {expect, test, type Page} from '@playwright/test';
import {createServer, type Server} from 'node:http';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {extname, join, resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';

const BUILD = resolve(import.meta.dirname, '../build');
const NODE = process.env.VERIFY_ETH_NODE;
const TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.css': 'text/css',
	'.gz': 'application/gzip',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.webmanifest': 'application/manifest+json',
};

function serve(options: {withPublication: boolean}): Promise<{server: Server; origin: string}> {
	const server = createServer((request, response) => {
		const path = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname);
		if (!options.withPublication && path.includes('/indexed-states/')) {
			response.writeHead(404).end();
			return;
		}
		let file = join(BUILD, path);
		if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
		if (!existsSync(file)) {
			response.writeHead(404).end();
			return;
		}
		response.writeHead(200, {'content-type': TYPES[extname(file)] ?? 'application/octet-stream'});
		response.end(readFileSync(file));
	});
	return new Promise((done) =>
		server.listen(0, '127.0.0.1', () => {
			const {port} = server.address() as {port: number};
			done({server, origin: `http://127.0.0.1:${port}`});
		}),
	);
}

type Snapshot = {phase?: string; lastToBlock?: number; latestBlock?: number; publication?: unknown; state: string};

/** The worker's progress and the app's `state` (the answer to readState), bigints tagged, keys sorted. */
async function read(page: Page): Promise<Snapshot> {
	return page.evaluate(() => {
		const w = window as unknown as {
			syncing: {subscribe(run: (value: any) => void): () => void};
			state: {$state: unknown};
		};
		let progress: any;
		w.syncing.subscribe((value) => (progress = value))();
		const canonical = (value: unknown) =>
			JSON.stringify(value, (_key, v) => {
				if (typeof v === 'bigint') return `${v}n`;
				if (v && typeof v === 'object' && !Array.isArray(v)) {
					return Object.fromEntries(
						Object.keys(v)
							.sort()
							.map((k) => [k, (v as Record<string, unknown>)[k]]),
					);
				}
				return v;
			});
		return {
			phase: progress?.phase,
			lastToBlock: progress?.lastToBlock,
			latestBlock: progress?.latestBlock,
			publication: progress?.publication,
			state: canonical(w.state.$state),
		};
	});
}

/** Wait for the worker to reach the tip, then for the state it answers to be read at least once more. */
async function untilAtTip(page: Page, label: string): Promise<Snapshot> {
	const started = Date.now();
	let last: Snapshot | undefined;
	for (;;) {
		last = await read(page);
		if (last.phase === 'at-tip') break;
		if (Date.now() - started > 40 * 60 * 1000)
			throw new Error(`${label} never reached the tip: ${JSON.stringify(last)}`);
		await page.waitForTimeout(2_000);
	}
	await page.evaluate(() => (window as any).stratagemsIndexer.refresh());
	const at = await read(page);
	console.log(`${label}: at the tip (block ${at.lastToBlock}) after ${Math.round((Date.now() - started) / 1000)} s`);
	return at;
}

/** The oracle, projected the way the app answers: every field except the commitments (the app asks its account's only). */
function oracleState(): string {
	const text = gunzipSync(
		readFileSync(resolve(import.meta.dirname, '../../indexer/oracle/2026-09-29-alpha1/old-snapshot.state.json.gz')),
	).toString('utf8');
	const {state} = JSON.parse(text);
	return JSON.stringify(sorted({...state, commitments: {}}));
}
function sorted(v: unknown): unknown {
	if (Array.isArray(v)) return v.map(sorted);
	if (v && typeof v === 'object')
		return Object.fromEntries(
			Object.keys(v)
				.sort()
				.map((k) => [k, sorted((v as any)[k])]),
		);
	return v;
}

test('a tab started from the publication lands on the state of a tab that indexed alpha1 itself', async ({browser}) => {
	expect(NODE, 'set VERIFY_ETH_NODE to a node for Base (chain 8453)').toBeTruthy();
	expect(
		existsSync(join(BUILD, 'indexed-states/alpha1/publication.json')),
		'build the app after pnpm indexer:index alpha1',
	).toBe(true);

	const withPublication = await serve({withPublication: true});
	const withoutPublication = await serve({withPublication: false});
	try {
		const published = await browser.newPage();
		const selfIndexed = await browser.newPage();
		for (const page of [published, selfIndexed]) {
			page.on('console', (message) => {
				if (message.type() === 'error') console.log(`[page error] ${message.text().slice(0, 300)}`);
			});
		}
		const query = `?ethnode=${encodeURIComponent(NODE!)}`;
		await published.goto(`${withPublication.origin}/${query}`);
		await selfIndexed.goto(`${withoutPublication.origin}/${query}`);

		await published.bringToFront();
		const fromPublication = await untilAtTip(published, 'from the publication');
		console.log(`  publication: ${JSON.stringify(fromPublication.publication)}`);
		expect((fromPublication.publication as {status?: string})?.status).toBe('found');

		await selfIndexed.bringToFront();
		const indexedItself = await untilAtTip(selfIndexed, 'indexed itself');
		console.log(`  publication: ${JSON.stringify(indexedItself.publication)}`);

		expect(fromPublication.state.length).toBeGreaterThan(1000);
		expect(fromPublication.state, 'the two tabs answer the same state').toBe(indexedItself.state);
		expect(JSON.stringify(sorted(JSON.parse(fromPublication.state, (_k, v) => v))), 'and it is the oracle').toBe(
			oracleState(),
		);
	} finally {
		withPublication.server.close();
		withoutPublication.server.close();
	}
});
