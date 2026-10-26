/**
 * Asking the CHAIN where the cycle is.
 *
 * The framework owns the cycle model and the policies (`$lib/game/core/cycle`);
 * which contract to ask is the game's, so it is passed in: one call to the
 * base's `getCycle`, turned into the shape the trackers read.
 *
 * Under the timed policy nothing calls this at all, because the cycle is pure
 * arithmetic over the deployment's own parameters. Under the other two it is
 * the authority, and the local clock only predicts between reads: a cycle that
 * moves when someone pushes it cannot be computed from a clock, and a cycle
 * that CAN be pushed forward cannot be computed from one either.
 */
import type {PublicClient} from 'viem';
import type {CycleReading} from '../cycle';
import type {CommitRevealContract} from './contract';

export function createCycleReader(deps: {
	publicClient: PublicClient;
	contract: CommitRevealContract;
}): () => Promise<CycleReading> {
	const {contract} = deps;
	return async () => {
		const cycle = (await deps.publicClient.readContract({
			address: contract.address,
			abi: contract.abi,
			functionName: 'getCycle',
		})) as {
			cycleNumber: bigint;
			commiting: boolean;
			phaseStart: bigint;
			phaseEnd: bigint;
		};
		return {
			cycleNumber: Number(cycle.cycleNumber),
			isCommitPhase: cycle.commiting,
			phaseStart: Number(cycle.phaseStart),
			phaseEnd: Number(cycle.phaseEnd),
		};
	};
}
