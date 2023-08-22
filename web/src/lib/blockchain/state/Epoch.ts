// import {createStore} from '$lib/utils/stores/utils';
import {time} from '$lib/time';
import {writable, type Readable, derived} from 'svelte/store';

const ACTION_PERIOD = 23 * 3600;
const TOTAL = 24 * 3600;

export function computeEpoch(time: number) {
	const totalTimePassed = time;
	const epoch = Math.floor(totalTimePassed / TOTAL + 1);
	const epochStartTime = (epoch - 1) * TOTAL;
	const timePassed = time - epochStartTime;
	const isActionPhase = timePassed < ACTION_PERIOD;
	const timeLeftToCommit = ACTION_PERIOD - timePassed;
	const timeLeftToReveal = isActionPhase ? -1 : TOTAL - timePassed;
	const timeLeftToEpochEnd = TOTAL - timePassed;
	return {epoch, timeLeftToEpochEnd, timeLeftToReveal, timeLeftToCommit, isActionPhase};
}

export function initEpoch(time: Readable<number>) {
	const epoch = writable(0, (set) =>
		time.subscribe((v) => {
			const epoch = computeEpoch(v).epoch;
			set(epoch);
		}),
	);

	const epochInfo = writable(
		{
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

	return {
		epoch: {subscribe: epoch.subscribe},
		epochInfo: {subscribe: epochInfo.subscribe},
	};
}

export const {epoch, epochInfo} = initEpoch(derived(time, (v) => v.timestamp));

if (typeof window !== 'undefined') {
	(window as any).epoch = epoch;
	(window as any).epochInfo = epochInfo;
}
