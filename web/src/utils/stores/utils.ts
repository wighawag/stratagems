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

// function subscribeMultiples(stores, callback) {
// 	// Store values of all the stores
// 	const values = [];
// 	const unsubscribes = [];
// 	// Subscribe to all the stores
// 	for (let i = 0; i < stores.length; i++) {
// 		unsubscribes[i] = stores[i].subscribe((value) => {
// 			values[i] = value;
// 			// Call the callback when all the stores have values
// 			if (values.length == stores.length) callback(values);
// 		});
// 	}

// 	return () => {
// 		unsubscribes.forEach((unsubscribe) => unsubscribe());
// 	};
// }
