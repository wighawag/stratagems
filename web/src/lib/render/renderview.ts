import type {Readable} from 'svelte/store';

export type RenderViewState = {width: number; height: number; devicePixelRatio: number};

export type RenderView = Readable<RenderViewState> & {
	update(): void;
	updateDevicePixelRatio(newRatio: number): void;
};
