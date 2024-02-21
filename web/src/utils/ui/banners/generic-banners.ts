import {writable} from 'svelte/store';
import type {Dismiss} from './types.js';

export type GenericBannerData = {
	title?: string;
	button?: string;
	message: string;
	ondismiss: Dismiss;
};

let store = writable<GenericBannerData[]>([]);

export let genericBanners = {
	subscribe: store.subscribe,
	close(data: GenericBannerData) {
		store.update((v) => {
			const i = v.indexOf(data);
			if (i >= 0) {
				v.splice(i, 1);
			}
			return v;
		});
	},
	open(data: GenericBannerData) {
		store.update((v) => {
			v.push(data);
			return v;
		});
	},
};
