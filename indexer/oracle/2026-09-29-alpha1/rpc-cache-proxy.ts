/**
 * A caching JSON-RPC proxy for VERIFYING the port, not part of the app.
 *
 * `tsx rpc-cache-proxy.ts --upstream <url> [--port 8546] [--cache <dir>]`
 *
 * Why it exists: alpha1 lives on Base between blocks 12,082,311 and 23,303,136 and
 * the chain is now past 51,900,000, so indexing it from its start block is ~20,000
 * `eth_getLogs` calls against a public node capped at 2,000 blocks per call. The
 * port has to be checked by folding that history TWICE, the same way both times:
 * once with `etherfold build` (the snapshot job), once by a browser tab that indexes
 * alpha1 itself. This proxy makes both read the SAME logs and pays the public node
 * once:
 *
 * - `eth_getLogs` is answered from 2,000-block chunks fetched upstream on a miss
 *   (a few in parallel) and cached on disk, for any range up to 200,000 blocks, so a
 *   fetcher learns a wide range and the second run is fast. A chunk is cached only
 *   once it is `FINAL_DEPTH` blocks below the tip it was fetched at.
 * - every other method is passed through untouched.
 *
 * It changes no answer: a range is the concatenation of the chunks' logs, in
 * (blockNumber, logIndex) order, exactly as the node returns them.
 */
import {createServer} from 'node:http';
import {appendFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';

function argument(name: string): string | undefined {
	const args = process.argv.slice(2);
	const at = args.indexOf(name);
	return at >= 0 ? args[at + 1] : undefined;
}

const upstream = argument('--upstream') ?? process.env.UPSTREAM_ETH_NODE_URI;
if (!upstream) {
	console.error('usage: tsx rpc-cache-proxy.ts --upstream <url> [--port 8546] [--cache <dir>]');
	process.exit(1);
}
const port = Number(argument('--port') ?? 8546);
const cacheDir = resolve(argument('--cache') ?? resolve(import.meta.dirname, '../../data/rpc-cache'));
mkdirSync(cacheDir, {recursive: true});
const cacheFile = resolve(cacheDir, 'chunks.ndjson');

const CHUNK = 2_000;
const MAX_RANGE = 200_000;
const PARALLEL = Number(argument('--parallel') ?? 6);
const FINAL_DEPTH = 1_000;

type Log = {blockNumber: string; logIndex: string; [key: string]: unknown};
type Filter = {
	address?: string | string[];
	topics?: unknown[];
	fromBlock?: string;
	toBlock?: string;
	blockHash?: string;
};

const chunks = new Map<string, Log[]>();
if (existsSync(cacheFile)) {
	for (const line of readFileSync(cacheFile, 'utf8').split('\n')) {
		if (!line) continue;
		const {key, logs} = JSON.parse(line) as {key: string; logs: Log[]};
		chunks.set(key, logs);
	}
}
console.log(`${chunks.size} cached chunks in ${cacheFile}`);

let nextId = 1;
async function call(method: string, params: unknown[]): Promise<{result?: unknown; error?: unknown}> {
	for (let attempt = 0; ; attempt++) {
		try {
			const response = await fetch(upstream!, {
				method: 'POST',
				headers: {'content-type': 'application/json'},
				body: JSON.stringify({jsonrpc: '2.0', id: nextId++, method, params}),
			});
			if (response.status === 429 || response.status >= 500) throw new Error(`upstream answered ${response.status}`);
			const body = (await response.json()) as {result?: unknown; error?: {code?: number; message?: string}};
			if (body.error && /rate|limit exceeded|too many/i.test(body.error.message ?? '') && attempt < 8) {
				throw new Error(body.error.message);
			}
			return body;
		} catch (error) {
			if (attempt >= 8) throw error;
			await new Promise((done) => setTimeout(done, 500 * 2 ** attempt));
		}
	}
}

let tip = 0;
async function refreshTip(): Promise<number> {
	const {result} = await call('eth_blockNumber', []);
	tip = Number(result);
	return tip;
}

function filterKey(filter: Filter): string {
	const addresses = [filter.address ?? []]
		.flat()
		.map((a) => a.toLowerCase())
		.sort();
	return JSON.stringify({addresses, topics: filter.topics ?? []});
}

async function chunkLogs(filter: Filter, start: number): Promise<Log[]> {
	const key = `${filterKey(filter)}@${start}`;
	const cached = chunks.get(key);
	if (cached) return cached;
	const end = start + CHUNK - 1;
	// the chunk holding the tip is asked only up to the tip: a node refuses a range past its head
	const asked = Math.min(end, tip);
	const body = await call('eth_getLogs', [
		{...filter, fromBlock: `0x${start.toString(16)}`, toBlock: `0x${asked.toString(16)}`},
	]);
	if (body.error) throw Object.assign(new Error('upstream refused'), {rpc: body.error});
	const logs = body.result as Log[];
	if (asked === end && end <= tip - FINAL_DEPTH) {
		chunks.set(key, logs);
		appendFileSync(cacheFile, JSON.stringify({key, logs}) + '\n');
	}
	return logs;
}

async function getLogs(filter: Filter): Promise<{result?: Log[]; error?: unknown}> {
	if (filter.blockHash) return (await call('eth_getLogs', [filter])) as {result?: Log[]};
	const latest = await refreshTip();
	const from = Number(filter.fromBlock ?? 0);
	const to = filter.toBlock === undefined || filter.toBlock === 'latest' ? latest : Number(filter.toBlock);
	if (to - from + 1 > MAX_RANGE) {
		return {error: {code: -32614, message: `eth_getLogs is limited to a ${MAX_RANGE.toLocaleString('en-US')} range`}};
	}
	if (to > latest) {
		// beyond what the node has: let it answer as it does
		return (await call('eth_getLogs', [filter])) as {result?: Log[]};
	}
	const {fromBlock: _from, toBlock: _to, ...rest} = filter;
	const starts: number[] = [];
	for (let start = Math.floor(from / CHUNK) * CHUNK; start <= to; start += CHUNK) starts.push(start);
	const pages: Log[][] = new Array(starts.length);
	for (let i = 0; i < starts.length; i += PARALLEL) {
		const batch = starts.slice(i, i + PARALLEL);
		const results = await Promise.all(batch.map((start) => chunkLogs(rest, start)));
		results.forEach((logs, j) => (pages[i + j] = logs));
	}
	const result = pages.flat().filter((log) => Number(log.blockNumber) >= from && Number(log.blockNumber) <= to);
	return {result};
}

createServer(async (request, response) => {
	// a browser tab calls this too: answer CORS
	response.setHeader('access-control-allow-origin', '*');
	response.setHeader('access-control-allow-headers', '*');
	if (request.method === 'OPTIONS') {
		response.end();
		return;
	}
	let body = '';
	for await (const part of request) body += part;
	const handle = async (message: {id: unknown; method: string; params?: unknown[]}) => {
		try {
			const answer =
				message.method === 'eth_getLogs'
					? await getLogs((message.params?.[0] ?? {}) as Filter)
					: await call(message.method, message.params ?? []);
			return {jsonrpc: '2.0', id: message.id, ...answer};
		} catch (error) {
			const rpc = (error as {rpc?: unknown}).rpc;
			return {jsonrpc: '2.0', id: message.id, error: rpc ?? {code: -32603, message: String(error)}};
		}
	};
	const parsed = JSON.parse(body);
	const answer = Array.isArray(parsed) ? await Promise.all(parsed.map(handle)) : await handle(parsed);
	response.setHeader('content-type', 'application/json');
	response.end(JSON.stringify(answer));
}).listen(port, '127.0.0.1', () => {
	console.log(`caching proxy for ${upstream} on http://127.0.0.1:${port}`);
});
