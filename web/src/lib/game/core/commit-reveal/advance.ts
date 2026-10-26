/**
 * The base's half of pushing the cycle on.
 *
 * The framework owns WHEN an advance is worth sending and what the conditions
 * are (`$lib/game/core/advance`); this file is the call: the base's
 * `getAttendance` read into the framework's shape, and `advanceCycle` sent the
 * way every other move is sent. Which contract is the game's, passed in.
 *
 * NOTHING HERE IS A MOVE, which is the thing to keep in mind while reading it.
 * An advance is permissionless and strictly conditional: it may only ever do
 * what the rules already permit, so it takes nothing from anybody and belongs
 * to nobody. That is what makes it safe to send from the local signer without
 * asking the player - the framework may spend gas on their behalf to keep the
 * cycle turning, and may never spend the STAKE without being asked, which is
 * what `./missed-reveal.ts` is careful about and this file has no equivalent
 * of.
 */
import {get} from 'svelte/store';
import type {CoreServices} from '$lib/context/core';
import type {Attendance} from '../advance';
import type {CommitRevealContract} from './contract';
import {sendMove, type MoveDeps} from './send';

/**
 * What the advance needs.
 *
 * `signerExecutor` for the same reason the commit and the reveal use it: the
 * key that plays sends this, so there is no wallet prompt in the middle of a
 * cycle, and an account with no wallet provider at all can still keep the game
 * moving.
 */
export type AdvanceDeps = MoveDeps;

/** Read who the cycle is waiting for, and how many have acted. */
export function createAttendanceReader(deps: {
	publicClient: CoreServices['publicClient'];
	contract: CommitRevealContract;
}): () => Promise<Attendance> {
	const {contract} = deps;
	return async () => {
		const attendance = (await deps.publicClient.readContract({
			address: contract.address,
			abi: contract.abi,
			functionName: 'getAttendance',
		})) as {waitedFor: bigint; committed: bigint; revealed: bigint};
		return {
			waitedFor: Number(attendance.waitedFor),
			committed: Number(attendance.committed),
			revealed: Number(attendance.revealed),
		};
	};
}

/**
 * Send `advanceCycle`, and resolve once it has been mined.
 *
 * NO DECLARED GAS LIMIT, and that is a deliberate exception to what commit and
 * reveal do rather than an omission. ADR-0003 has the deployment declare those
 * two because they are measured against the game's own contracts and because
 * an `eth_estimateGas` round trip inside a reveal window is time a multi-chunk
 * turn cannot spare. Neither argument reaches here: an advance is one small
 * call, it is not racing a phase boundary (it IS the phase boundary), and a
 * figure measured for it would be a fourth number to keep in step for no
 * benefit. Estimating is also safe on the chain this most matters on: an
 * estimate executes at the last mined block's timestamp, which on an automined
 * tab-local chain is frozen between transactions - and a manual cycle reads no
 * timestamp at all, so there is nothing for a stale one to get wrong. (See
 * `work/notes/findings/an-automined-chain-has-no-clock-between-transactions.md`
 * for the timed case, where it is a real problem and this file's reasoning
 * would not hold.)
 */
export function createCycleAdvancer(params: {
	deps: AdvanceDeps;
	contract: CommitRevealContract;
}): () => Promise<`0x${string}`> {
	const {deps, contract} = params;
	return async () => {
		await deps.connection.ensureConnected();
		const executor = get(deps.signerExecutor);
		if (executor.status !== 'ready') {
			// Thrown rather than returned quietly: the framework backs off on a
			// failure and resets the moment the chain says something new, so a
			// silent success here would report a cycle as pushed when nothing was
			// sent.
			throw new Error(
				'No signing key yet, so the cycle cannot be advanced from this browser.',
			);
		}
		return sendMove(
			deps,
			executor,
			{
				address: contract.address,
				abi: contract.abi,
				// Takes nothing and returns where the cycle landed. Anyone may call
				// it; this browser is simply the one that noticed.
				functionName: 'advanceCycle',
				args: [],
				account: executor.account,
				chain: null,
			},
			'The cycle advance',
		);
	};
}
