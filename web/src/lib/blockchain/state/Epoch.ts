// import {createStore} from '$lib/utils/stores/utils';
import {time} from '$lib/time';
import {writable, type Readable, derived} from 'svelte/store';

const ACTION_PERIOD = 23 * 3600;
const TOTAL = 24 * 3600;

export function computeEpoch(time: number) {
	// reuse same variable name
	const COMMIT_PHASE_DURATION = ACTION_PERIOD;
	const RESOLUTION_PHASE_DURATION = TOTAL - ACTION_PERIOD;
	const START_TIME = 0;
	// --------------------

	const epochDuration = COMMIT_PHASE_DURATION + RESOLUTION_PHASE_DURATION;
	// const time = _timestamp();
	const timePassed = time - START_TIME;
	const epoch = Math.floor(timePassed / epochDuration + 2); // epoch start at 2, this make the hypothetical previous resolution phase's epoch to be 1
	const commiting = timePassed - (epoch - 2) * epochDuration < COMMIT_PHASE_DURATION;
	// ---------------
	const epochStartTime = (epoch - 2) * epochDuration;
	const timePassedFromEpochStart = time - epochStartTime;
	const isActionPhase = commiting;
	const timeLeftToCommit = COMMIT_PHASE_DURATION - timePassedFromEpochStart;
	const timeLeftToReveal = isActionPhase ? -1 : epochDuration - timePassedFromEpochStart;
	const timeLeftToEpochEnd = epochDuration - timePassedFromEpochStart;
	return {epoch, timeLeftToEpochEnd, timeLeftToReveal, timeLeftToCommit, isActionPhase};

	// const totalTimePassed = time;
	// const epoch = Math.floor(totalTimePassed / TOTAL + 1);
	// const epochStartTime = (epoch - 1) * TOTAL;
	// const timePassed = time - epochStartTime;
	// const isActionPhase = timePassed < ACTION_PERIOD;
	// const timeLeftToCommit = ACTION_PERIOD - timePassed;
	// const timeLeftToReveal = isActionPhase ? -1 : TOTAL - timePassed;
	// const timeLeftToEpochEnd = TOTAL - timePassed;
	// return {epoch, timeLeftToEpochEnd, timeLeftToReveal, timeLeftToCommit, isActionPhase};
	/*
		uint256 epochDuration = COMMIT_PHASE_DURATION + RESOLUTION_PHASE_DURATION;
		console.log(COMMIT_PHASE_DURATION);
		console.log(RESOLUTION_PHASE_DURATION);
		console.log(START_TIME);
		console.log(epochDuration);
		uint256 time = _timestamp();
		console.log(time);
		require(time >= START_TIME, 'GAME_NOT_STARTED');
		uint256 timePassed = time - START_TIME;
		epoch = uint32(timePassed / epochDuration + 2); // epoch start at 2, this make the hypothetical previous resolution phase's epoch to be 1
		commiting = timePassed - ((epoch - 2) * epochDuration) < COMMIT_PHASE_DURATION;
	*/
}

export type EpochState = {
	epoch: number;
	isActionPhase: boolean;
};

export function initEpoch(time: Readable<number>) {
	const epoch = writable(0, (set) =>
		time.subscribe((v) => {
			const epoch = computeEpoch(v).epoch;
			set(epoch);
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

export const {epoch, epochState, epochInfo} = initEpoch(derived(time, (v) => v.timestamp));

if (typeof window !== 'undefined') {
	(window as any).epoch = epoch;
	(window as any).epochState = epochState;
	(window as any).epochInfo = epochInfo;
}
