import type {Cell} from 'stratagems-common';
import {writable} from 'svelte/store';

export type LandMenuState = {
	cell: Cell | undefined;
};

export const landmenu = writable<LandMenuState>({cell: undefined});
