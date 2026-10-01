import {everySeconds} from '$lib/blockchain/time';
import {computeEpoch, epochInfo} from '$lib/state/Epoch';
import {derived, get, writable} from 'svelte/store';

export type InfoData = {panel: {type: 'RevealPhase'; timeLeftToReveal: number} | {type: 'MaxMovesReached'} | undefined};

const _info = writable<InfoData>(
	{
		panel: undefined,
	},
	(set, update) => {
		return derived(everySeconds, ($everySeconds) => computeEpoch($everySeconds.timestamp)).subscribe(($epochInfo) => {
			update(($info) => {
				if ($info.panel?.type == 'RevealPhase') {
					if ($epochInfo.isActionPhase) {
						$info.panel = undefined;
					} else {
						$info.panel.timeLeftToReveal = $epochInfo.timeLeftToReveal;
					}
				}
				return $info;
			});
		});
	},
);

export const info = {
	subscribe: _info.subscribe,
	setRevealPhase() {
		_info.set({panel: {type: 'RevealPhase', timeLeftToReveal: get(epochInfo).timeLeftToReveal}});
	},
	setMaxMovesReached() {
		_info.set({panel: {type: 'MaxMovesReached'}});
	},
	close() {
		_info.set({panel: undefined});
	},
};
