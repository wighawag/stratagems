import type {ViewCellData} from '$lib/state/ViewState';
import {writable} from 'svelte/store';

export type LandMenuState =
	| {
			x: number;
			y: number;
			cell: ViewCellData;
			owner: `0x${string}`;
	  }
	| undefined;

export const landmenu = writable<LandMenuState>(undefined);
