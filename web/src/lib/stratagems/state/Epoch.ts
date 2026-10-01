// import {createStore} from '$lib/utils/stores/utils';
import {every3Seconds} from '$lib/blockchain/time';
import {contractsInfos} from '$lib/config';
import {writable, type Readable, derived, get} from 'svelte/store';

export function computeEpoch(time: number) {
	const currentContractsInfos = get(contractsInfos);
	// reuse same variable name
	const COMMIT_PHASE_DURATION = Number(
		currentContractsInfos.contracts.Stratagems.linkedData.commitPhaseDuration.slice(0, -1),
	);
	const REVEAL_PHASE_DURATION = Number(
		currentContractsInfos.contracts.Stratagems.linkedData.revealPhaseDuration.slice(0, -1),
	);
	const START_TIME = 0;
	// --------------------
	// From Solidity
	const epochDuration = COMMIT_PHASE_DURATION + REVEAL_PHASE_DURATION;
	// const time = _timestamp();
	const timePassed = time - START_TIME;
	const epoch = Math.floor(timePassed / epochDuration + 2); // epoch start at 2, this make the hypothetical previous reveal phase's epoch to be 1
	const commiting = timePassed - (epoch - 2) * epochDuration < COMMIT_PHASE_DURATION;
	// ---------------
	const epochStartTime = (epoch - 2) * epochDuration;
	const timePassedFromEpochStart = time - epochStartTime;
	const isActionPhase = commiting;
	const timeLeftToCommit = COMMIT_PHASE_DURATION - timePassedFromEpochStart;
	const timeLeftToReveal = isActionPhase ? -1 : epochDuration - timePassedFromEpochStart;
	const timeLeftToEpochEnd = epochDuration - timePassedFromEpochStart;
	return {epoch, timeLeftToEpochEnd, timeLeftToReveal, timeLeftToCommit, isActionPhase};
}

export type EpochState = {
	epoch: number;
	isActionPhase: boolean;
};

export function initEpoch(time: Readable<number>) {
	let lastEpoch = 0;
	const epoch = writable(0, (set) =>
		time.subscribe((v) => {
			const epoch = computeEpoch(v).epoch;
			if (lastEpoch != epoch) {
				lastEpoch = epoch;
				set(epoch);
			}
		}),
	);

	const epochInfo = writable(
		{
			epoch: 0,
			timeLeftToCommit: 0,
			timeLeftToReveal: 0,
			timeLeftToEpochEnd: 0,
			isActionPhase: false,
		},
		(set) =>
			time.subscribe((v) => {
				const epochInfo = computeEpoch(v);
				set(epochInfo);
			}),
	);

	const $epochState: EpochState = {
		epoch: 0,
		isActionPhase: false,
	};
	const epochState = writable($epochState, (set) =>
		time.subscribe((v) => {
			const epochInfo = computeEpoch(v);
			if ($epochState.epoch !== epochInfo.epoch || $epochState.isActionPhase !== epochInfo.isActionPhase) {
				$epochState.epoch = epochInfo.epoch;
				$epochState.isActionPhase = epochInfo.isActionPhase;
				set($epochState);
			}
		}),
	);

	return {
		epoch: {subscribe: epoch.subscribe},
		epochInfo: {subscribe: epochInfo.subscribe},
		epochState: {subscribe: epochState.subscribe},
	};
}

export const {epoch, epochState, epochInfo} = initEpoch(derived(every3Seconds, (v) => v.timestamp));

if (typeof window !== 'undefined') {
	(window as any).epoch = epoch;
	(window as any).epochState = epochState;
	(window as any).epochInfo = epochInfo;
}
