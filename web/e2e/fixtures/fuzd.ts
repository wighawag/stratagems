import {spawn} from 'node:child_process';
import {
	closeSync,
	existsSync,
	openSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';

/**
 * The fuzd the fuzd suite runs against (`with/fuzd`): started by its setup
 * project, stopped by its teardown, and frozen by the test that needs a fuzd
 * that does not answer. Everything here acts on the ONE process group this run
 * started, recorded in a file scripts/run-e2e-tests.sh names and cleans up
 * after, never on whatever else is listening on a port.
 */
const env = (globalThis as any).process.env as Record<
	string,
	string | undefined
>;

function required(name: string): string {
	const value = env[name];
	if (!value) {
		throw new Error(
			`${name} is not set: the fuzd suite runs under scripts/run-e2e-tests.sh, which sets it.`,
		);
	}
	return value;
}

export const FUZD_URL = () => required('E2E_FUZD_URL');

function pgid(): number {
	const file = required('E2E_FUZD_PGID_FILE');
	if (!existsSync(file)) throw new Error('fuzd was not started by this run');
	return Number(readFileSync(file, 'utf8').trim());
}

async function answers(): Promise<string | undefined> {
	try {
		const response = await fetch(`${FUZD_URL()}/`, {
			signal: AbortSignal.timeout(1000),
		});
		return response.ok ? await response.text() : undefined;
	} catch {
		return undefined;
	}
}

/** Start fuzd on the run's port, against the run's chain, and wait for it. */
export async function startFuzd(): Promise<void> {
	if (await answers()) {
		throw new Error(
			`something already answers on ${FUZD_URL()}: not ours to use`,
		);
	}
	const log = openSync(required('E2E_FUZD_LOG'), 'w');
	// `detached`: a process group of its own, so stopping it reaches the CLI
	// under pnpm's wrappers and nothing else.
	const child = spawn('pnpm', ['run', 'dev'], {
		cwd: required('E2E_FUZD_DIR'),
		detached: true,
		stdio: ['ignore', log, log],
		env: {
			...env,
			FUZD_PORT: required('E2E_FUZD_PORT'),
			FUZD_CHAIN_RPC: required('E2E_RPC_URL'),
		},
	});
	child.unref();
	closeSync(log);
	if (!child.pid) throw new Error('fuzd did not start');
	writeFileSync(required('E2E_FUZD_PGID_FILE'), String(child.pid));

	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		const version = await answers();
		if (version) {
			console.log(`[fuzd] ${version} on ${FUZD_URL()} (pgid ${child.pid})`);
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(
		`fuzd did not answer on ${FUZD_URL()}: see ${env.E2E_FUZD_LOG}`,
	);
}

/** Stop the fuzd this run started, its whole group. */
export async function stopFuzd(): Promise<void> {
	const file = required('E2E_FUZD_PGID_FILE');
	if (!existsSync(file)) return;
	const group = pgid();
	for (const signal of ['SIGCONT', 'SIGTERM'] as const) {
		try {
			process.kill(-group, signal);
		} catch {
			// Already gone.
		}
	}
	await new Promise((resolve) => setTimeout(resolve, 1000));
	try {
		process.kill(-group, 'SIGKILL');
	} catch {
		// Gone.
	}
	rmSync(file, {force: true});
}

/**
 * FREEZE fuzd (SIGSTOP), so it neither answers nor broadcasts, and thaw it
 * after: "fuzd is down" without losing what it holds, and without the port
 * being free for anything else to take meanwhile.
 */
export function freezeFuzd(): void {
	process.kill(-pgid(), 'SIGSTOP');
}

export function thawFuzd(): void {
	process.kill(-pgid(), 'SIGCONT');
}

/** The remote account fuzd broadcasts from for this signing account. */
export async function remoteAccountOf(signer: string): Promise<`0x${string}`> {
	const response = await fetch(
		`${FUZD_URL()}/api/execution/remoteAccount/31337/${signer.toLowerCase()}`,
	);
	const body = (await response.json()) as {account?: {address?: string}};
	if (!body.account?.address)
		throw new Error('fuzd has no remote account for it');
	return body.account.address.toLowerCase() as `0x${string}`;
}

/** What fuzd recorded for one transaction of a scheduled batch. */
export async function fuzdExecution(
	schedule: {chainId: string; account: string; slot: string},
	batchIndex: number,
): Promise<
	| {hash?: string; transactionParametersUsed?: {from: string; nonce: string}}
	| undefined
> {
	const response = await fetch(
		`${FUZD_URL()}/api/execution/execution/${schedule.chainId}/${schedule.account}/${schedule.slot}/${batchIndex}`,
	);
	const body = (await response.json()) as {execution?: never};
	return body.execution;
}
