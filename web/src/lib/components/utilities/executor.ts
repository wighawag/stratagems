import {writable, type Readable} from 'svelte/store';

export type Execution<T> = {executing: boolean; error?: any; result?: T};
export function createExecutor<T, F extends (...args: any[]) => Promise<T>>(
	func: F,
): Readable<Execution<T>> & {
	execute: F;
	acknowledgeError: () => void;
} {
	const executing = writable<Execution<T>>({executing: false});

	const execute = ((...args: any[]) => {
		executing.set({executing: true, error: undefined, result: undefined});
		return func(...args)
			.then((v) => {
				try {
					executing.set({executing: false, result: v});
				} catch {}
				return v;
			})
			.catch((err) => {
				try {
					executing.set({executing: false, error: err});
				} catch {}
				throw err;
			});
	}) as F;
	return {
		subscribe: executing.subscribe,
		acknowledgeError() {
			executing.set({executing: false, error: undefined, result: undefined});
		},
		execute,
	};
}
