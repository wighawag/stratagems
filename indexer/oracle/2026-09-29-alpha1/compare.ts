/**
 * THE ORACLE COMPARISON: does the etherfold fold answer every question `web/` asks
 * of alpha1 the way the old JS processor's state does?
 *
 *   pnpm indexer:index alpha1                     # fold + publish (etherfold build --publish)
 *   pnpm --filter ./indexer compare:alpha1         # this
 *
 * Three answers to the same questions, over the same history:
 *
 * - ORACLE: `old-snapshot.state.json.gz`, the state the old pipeline published
 *   (see README.md for its provenance), read by the old code's own walks.
 * - FOLD: the database `etherfold build` wrote (`data/alpha1.db`), asked through
 *   `etherfold serve`'s `/graphql` with the web app's own documents
 *   (`src/queries.ts`, `httpExecutor`).
 * - PUBLICATION: what `--publish` wrote (`web/static/indexed-states/alpha1`),
 *   installed the way the web worker installs it (`openAndBootstrap` into the
 *   IndexedDB store, here `fake-indexeddb`) and asked through the IndexedDB
 *   accessor, the one the worker's GraphQL reads. This half also MEASURES how many
 *   rows the web app's query examines: the smallest rows-examined bound it passes.
 *
 * Exit code 0 when every question agrees, 1 otherwise.
 */
import 'fake-indexeddb/auto';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createBrowserStateStore} from '@etherfold/browser';
import {buildQuerySchema, httpExecutor, localExecutor} from '@etherfold/graphql';
import {openAndBootstrap} from '@etherfold/processor-entities';
import {StratagemsContract, bigIntIDToXY} from 'stratagems-common';
import {FULL_STATE_QUERY, readState, StateQueryError, type Execute} from '../../src/queries.js';
import {stratagemsProcessor} from '../../src/processor.js';
import {STREAM_FINALITY} from '../../src/source.js';
import type {Data} from '../../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const indexerRoot = resolve(here, '../..');
const MODE = 'alpha1';
const DB = resolve(indexerRoot, `data/${MODE}.db`);
const PUBLICATION = resolve(indexerRoot, `../web/static/indexed-states/${MODE}`);
const BUNDLE = resolve(indexerRoot, 'dist/processor.bundle.js');

// ---------------------------------------------------------------------------
// the ORACLE: the old state file, bigints revived from the old "123n" convention
// ---------------------------------------------------------------------------

type OldSnapshot = {lastSync: {lastToBlock: number; context: {processor: string}}; state: Data};

function loadOracle(): OldSnapshot {
	const text = gunzipSync(readFileSync(resolve(here, 'old-snapshot.state.json.gz'))).toString('utf8');
	return JSON.parse(text, (_key, value) =>
		typeof value === 'string' && /^-?\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value,
	);
}

// ---------------------------------------------------------------------------
// the QUESTIONS, answered from a `Data` the way web/ reads it
// ---------------------------------------------------------------------------

/** Canonical text: object keys sorted (arrays keep their order), bigints tagged. */
function canonical(value: unknown): string {
	return JSON.stringify(value, (_key, v) => {
		if (typeof v === 'bigint') return `${v}n`;
		if (v && typeof v === 'object' && !Array.isArray(v)) {
			return Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]));
		}
		return v;
	});
}

/** The rows `EventsView.svelte` lists, in the order it lists them. */
function eventRows(data: Data) {
	const rows: {epoch: number; position: string; players: {color: number; address: string}[]}[] = [];
	for (const epochPlacements of data.placements) {
		for (const position of Object.keys(epochPlacements.cells)) {
			rows.push({epoch: epochPlacements.epoch, position, players: epochPlacements.cells[position].players});
		}
	}
	return rows;
}

/** `ViewState.ts`'s `players[owner].numLands`: cells still alive at `epoch`, per owner. */
function numLands(data: Data, epoch: number) {
	const contract = new StratagemsContract(structuredClone(data), 7);
	const lands: Record<string, number> = {};
	for (const cellID of Object.keys(data.cells)) {
		const {updatedCell} = contract.getUpdatedCell(BigInt(cellID), epoch);
		const owner = data.owners[cellID]?.toLowerCase();
		if (updatedCell.life > 0) lands[owner] = (lands[owner] ?? 0) + 1;
	}
	return lands;
}

/** The cells a 64x64 viewport around (0,0) would draw (a derived answer: the renderer iterates every cell). */
function viewport(data: Data) {
	return Object.keys(data.cells)
		.filter((position) => {
			const {x, y} = bigIntIDToXY(BigInt(position));
			return x >= -32 && x < 32 && y >= -32 && y < 32;
		})
		.sort();
}

type Question = {id: string; asks: string; answer: (data: Data) => unknown};

function questions(epoch: number): Question[] {
	return [
		{id: 'Q1', asks: 'every cell, nine fields (ViewState, TerrainLayer, tests)', answer: (d) => d.cells},
		{id: 'Q2', asks: 'the owner of every cell (ViewState, Blockies)', answer: (d) => d.owners},
		{id: 'Q3', asks: 'every commitment (ViewState reads the account one: see Q3a)', answer: (d) => d.commitments},
		{id: 'Q4', asks: 'placements of the last 7 epochs, as EventsView lists them', answer: eventRows},
		{id: 'Q5', asks: 'every account reward state + the global rate (leaderboard)', answer: (d) => d.points.shared},
		{id: 'Q5b', asks: 'the global reward rate (leaderboard)', answer: (d) => d.points.global},
		{id: 'Q6', asks: 'computedPoints per owner (StratagemsContract in ViewState)', answer: (d) => d.computedPoints},
		{id: 'Q7', asks: 'fixed reward state per account (not read by web/)', answer: (d) => d.points.fixed},
		{id: 'D1', asks: `lands alive per owner at epoch ${epoch} (ViewState numLands)`, answer: (d) => numLands(d, epoch)},
		{id: 'D2', asks: 'cells in the 64x64 viewport around 0,0', answer: viewport},
	];
}

// ---------------------------------------------------------------------------
// the FOLD, through `etherfold serve`
// ---------------------------------------------------------------------------

async function freePort(): Promise<number> {
	return new Promise((done, fail) => {
		const server = createServer();
		server.listen(0, '127.0.0.1', () => {
			const {port} = server.address() as {port: number};
			server.close(() => done(port));
		});
		server.on('error', fail);
	});
}

async function serveFold(): Promise<{execute: Execute; stop(): void}> {
	const port = await freePort();
	const child = spawn(
		resolve(indexerRoot, 'node_modules/.bin/etherfold'),
		['serve', '--db', `file:${DB}`, '--port', String(port), '--host', '127.0.0.1'],
		{stdio: ['ignore', 'pipe', 'inherit']},
	);
	await new Promise<void>((done, fail) => {
		let out = '';
		child.stdout!.on('data', (chunk) => {
			out += chunk;
			if (out.includes('/graphql')) done();
		});
		child.on('exit', (code) => fail(new Error(`etherfold serve exited with ${code}: ${out}`)));
	});
	return {execute: httpExecutor(`http://127.0.0.1:${port}/graphql`) as Execute, stop: () => child.kill()};
}

// ---------------------------------------------------------------------------
// the PUBLICATION, installed into IndexedDB the way the worker installs it
// ---------------------------------------------------------------------------

async function installPublication() {
	const bundle = readFileSync(BUNDLE);
	const processor = `sha256:${createHash('sha256').update(bundle).digest('hex')}`;
	const index = JSON.parse(readFileSync(resolve(PUBLICATION, 'publication.json'), 'utf8')) as {
		snapshots: Record<string, {processor: string; body: string; cut: number; takenAt: {number: number}}>;
	};
	const entries = Object.values(index.snapshots).filter((entry) => entry.processor === processor);
	if (entries.length !== 1) {
		throw new Error(`the publication has ${entries.length} snapshot(s) for this bundle (${processor})`);
	}
	const entry = entries[0];
	const fileFetch = (async (input: string | URL) => {
		const path = fileURLToPath(new URL(String(input)));
		return existsSync(path) ? new Response(readFileSync(path)) : new Response('not found', {status: 404});
	}) as typeof fetch;
	const backend = await createBrowserStateStore(stratagemsProcessor.entities, {databaseName: 'compare-publication'});
	const {store, outcome} = await openAndBootstrap(backend, [new URL(entry.body, `file://${PUBLICATION}/`).href], {
		processor,
		finalityDepth: STREAM_FINALITY,
		fetch: fileFetch,
	});
	if (outcome.status !== 'bootstrapped') throw new Error(`the publication did not install: ${canonical(outcome)}`);
	const schema = buildQuerySchema(stratagemsProcessor.entities);
	const queryable = store as unknown as {
		accessor(options?: {rowsExaminedBound?: number}): never;
		tip(): Promise<number | undefined>;
	};
	const executeWithBound = (rowsExaminedBound?: number) =>
		localExecutor(schema, {
			accessor: queryable.accessor(rowsExaminedBound === undefined ? {} : {rowsExaminedBound}),
			generation: 'publication',
			tip: () => queryable.tip(),
			asOf: false,
		}) as Execute;
	return {entry, processor, outcome, executeWithBound};
}

/** The smallest rows-examined bound the web app's full-state document is answered under. */
async function smallestPassingBound(executeWithBound: (bound?: number) => Execute) {
	let low = 1;
	let high = 25_000;
	let refusedAt: {bound: number; message: string} | undefined;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		const {errors} = await executeWithBound(middle)({query: FULL_STATE_QUERY});
		if (errors?.length) {
			low = middle + 1;
			refusedAt = {bound: middle, message: errors[0].message.slice(0, 160)};
		} else high = middle;
	}
	return {bound: low, refusedAt};
}

// ---------------------------------------------------------------------------

const oracle = loadOracle();
if (process.argv.includes('--negative-control')) {
	// a comparison that cannot fail proves nothing: change one cell's life in the
	// oracle and expect Q1 (and what derives from it) to come out DIFFERENT
	const [position, cell] = Object.entries(oracle.state.cells)[0];
	oracle.state.cells[position] = {...cell, life: cell.life + 1};
	console.log(`NEGATIVE CONTROL: the oracle's cell ${position} has life ${cell.life + 1} instead of ${cell.life}`);
}
console.log(
	`oracle: the old processor's state at block ${oracle.lastSync.lastToBlock} (processor ${oracle.lastSync.context.processor})`,
);

const fold = await serveFold();
let failed = false;
try {
	const folded = await readState(fold.execute);
	console.log(`fold: data/${MODE}.db, answered as of block ${folded.block} by generation ${folded.generation}`);

	const publication = await installPublication();
	const published = await readState(publication.executeWithBound());
	console.log(
		`publication: ${publication.entry.body} (processor ${publication.processor}), installed at block ${published.block}`,
	);

	const maxEpoch = Math.max(...Object.values(oracle.state.cells).map((cell) => cell.lastEpochUpdate));
	const lines = ['| | question | oracle | fold | publication |', '| --- | --- | --- | --- | --- |'];
	for (const question of questions(maxEpoch + 1)) {
		const expected = canonical(question.answer(oracle.state));
		const size = (value: unknown) =>
			Array.isArray(value) ? value.length : value && typeof value === 'object' ? Object.keys(value).length : 1;
		const verdict = (data: Data) => (canonical(question.answer(data)) === expected ? 'same' : 'DIFFERENT');
		const a = verdict(folded.data);
		const b = verdict(published.data);
		if (a !== 'same' || b !== 'same') failed = true;
		lines.push(`| ${question.id} | ${question.asks} | ${size(question.answer(oracle.state))} | ${a} | ${b} |`);
	}

	// Q3a: the document web/ actually sends, once per account it could be connected as
	const accounts = new Set<string>([
		...Object.values(oracle.state.owners).map((owner) => owner.toLowerCase()),
		...Object.keys(oracle.state.points.shared).map((account) => account.toLowerCase()),
		...Object.keys(oracle.state.commitments),
		'0x000000000000000000000000000000000000dead',
	]);
	let sameCommitments = 0;
	for (const account of accounts) {
		const expected = canonical(oracle.state.commitments[account] ? {[account]: oracle.state.commitments[account]} : {});
		const asked = await readState(fold.execute, {account});
		if (canonical(asked.data.commitments) === expected) sameCommitments++;
	}
	if (sameCommitments !== accounts.size) failed = true;
	lines.push(
		`| Q3a | the connected account's commitment (web's document, per account) | ${accounts.size} accounts | ${sameCommitments === accounts.size ? 'same' : 'DIFFERENT'} | |`,
	);
	console.log('\n' + lines.join('\n'));

	const measured = await smallestPassingBound(publication.executeWithBound);
	console.log(
		`\nrows examined: the web app's state document is answered under a rows-examined bound of ${measured.bound} and ` +
			`refused under ${measured.bound - 1} (${measured.refusedAt?.message ?? 'n/a'}); the default bound is 25,000.`,
	);
} catch (error) {
	failed = true;
	console.error(error instanceof StateQueryError ? `${error.code}: ${error.message}` : error);
} finally {
	fold.stop();
}

console.log(failed ? '\nRESULT: the fold DIFFERS from the oracle' : '\nRESULT: every question answered the same');
process.exit(failed ? 1 : 0);
