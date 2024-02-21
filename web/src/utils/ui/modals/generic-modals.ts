import {writable} from 'svelte/store';

export type InfoModalData = {
	type: 'info';
	title?: string;
	message: string;
};

export type ConfirmModalData = {
	type: 'confirm';
	title?: string;
	message: string;
	onResponse: (value: boolean) => void;
};

export type GenericModalData = InfoModalData | ConfirmModalData;

let store = writable<GenericModalData[]>([]);

export let genericModals = {
	subscribe: store.subscribe,
	close(data: GenericModalData) {
		store.update((v) => {
			const i = v.indexOf(data);
			if (i >= 0) {
				v.splice(i, 1);
			}
			return v;
		});
	},
	open(data: GenericModalData) {
		store.update((v) => {
			v.push(data);
			return v;
		});
	},
};
