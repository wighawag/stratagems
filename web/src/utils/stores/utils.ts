import {writable, type Readable} from 'svelte/store';

export function createStore<T extends {[field: string]: unknown}>(
	$state: T,
): {
	set(data: Partial<T>): void;
	readonly $state: T;
	readable: Readable<T> & {
		$state: T;
		acknowledgeError(): void;
	};
} {
	const store = writable($state);
	function set(data: Partial<T>) {
		for (const field of Object.keys(data)) {
			($state as any)[field] = data[field];
		}
		store.set($state);
	}
	return {
		set,
		$state,
		readable: {
			$state,
			subscribe: store.subscribe,
			acknowledgeError() {
				(set as any)({error: undefined});
			},
		},
	};
}
