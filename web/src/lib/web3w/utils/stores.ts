import {writable, get, type Readable, type StoresValues, type Stores, derived, noop} from 'sveltore';

export type ErrorData = {
	code: number;
	title: string;
	message: string;
	errorObject?: unknown;
};
export type ReadableWithData<T> = Readable<T> & {readonly _data: T};
export type StoreWithErrors<T extends {error?: ErrorData}> = Readable<T> & {
	acknowledgeError: () => void;
};

export type StateData<T extends string> = {
	state: T | 'Idle';
	transitioning?: string;
	error?: ErrorData;
};

export type FlowData = {
	state: 'Idle' | 'SettingUp' | 'Executing';
	error?: ErrorData;
};
export type FlowActions<T> = {
	execute<D>(func: ($store: T) => Promise<D> | D): Promise<D>;
	cancel(err?: any): void;
	acknowledgeError: () => void;
};
export type FlowStore<T> = Readable<FlowData> & FlowActions<T>;

export function createFlowStore<S extends Stores>(
	stores: S,
	stateDesired: (values: StoresValues<S>) => boolean,
	setup?: (stores: S) => Promise<void> | void
): FlowStore<StoresValues<S>> {
	// const store = Array.isArray(stores) ? derived(stores, (v) => v) : stores;
	const store = derived(stores, (v) => v);

	let current: {reject: (error?: any) => void; unsubscribe?: () => void} | undefined = undefined;

	const {subscribe, assign, acknowledgeError} = setupWriteableWithError<FlowData>({
		state: 'Idle',
	});

	const execute = async <R>(func: ($store: StoresValues<S>) => Promise<R> | R): Promise<R> => {
		const promise = new Promise(async (resolve, reject) => {
			if (current) {
				return reject(`flow in progress`);
			}
			current = {reject};

			const exec = async () => {
				assign({
					state: 'Executing',
				});
				let result: R;
				try {
					result = await func(get(store));
				} catch (e) {
					current.unsubscribe && current.unsubscribe();
					current.reject(e);
					current = undefined;
					assign({
						state: 'Idle',
						error: undefined,
					});
				}
				if (!current) {
					// do not resolve as current has already been rejected / cancelled
					return;
				}
				assign({
					state: 'Idle',
				});
				resolve(result);
			};

			if (stateDesired(get(store))) {
				exec();
			} else {
				assign({
					state: 'SettingUp',
				});

				current.unsubscribe = store.subscribe(($store: StoresValues<S>) => {
					if (stateDesired($store)) {
						current.unsubscribe && current.unsubscribe();
						current.unsubscribe = undefined;
						exec();
					}
				});
				setup(stores);
			}
		});

		return promise as Promise<R>;
	};

	const cancel = (err?: any) => {
		if (current) {
			current.unsubscribe && current.unsubscribe();
			current.reject(err);
			current = undefined;
			assign({
				state: 'Idle',
				error: undefined,
			});
		}
	};

	return {
		cancel,
		execute,
		subscribe,
		acknowledgeError,
	};
}

// return a function that return a FlowStore
export function flowFor<S extends Stores>(
	stores: S,
	stateDesired: (values: StoresValues<S>) => boolean,
	setup?: (stores: S) => Promise<void> | void
) {
	const st = createFlowStore(stores, stateDesired, setup || noop);
	return (func?: (values: StoresValues<S>) => Promise<any> | any): FlowStore<StoresValues<S>> => {
		st.execute(func || noop);
		return st;
	};
}

export function stateEquals<ST extends string>(expected: ST) {
	return ({state}) => state === expected;
}

function readonlyProxy<T extends {}>(data: T): Readonly<T> {
	return new Proxy(data, {
		set(target: T, p: string, value, receiver: T) {
			return false;
			// throw new Error(`cannot set data members`);
		},
	});
}

export function setupWriteable<T>(data: T) {
	const store = writable<T>(data);
	function assign(d: Partial<T>) {
		Object.assign(data, d);
		store.set(data);
	}
	return {
		_data: (typeof data === 'object' ? readonlyProxy(data) : data) as Readonly<T>,
		assign,
		subscribe: store.subscribe,
	};
}

export function setupWriteableWithError<T extends {}>(data: T) {
	const st = setupWriteable<T & {error?: ErrorData}>(data);
	return {
		...st,
		acknowledgeError() {
			st.assign({error: undefined} as any);
		},
	};
}

export function setupWriteableWithState<States extends string, T>(data: T) {
	const d: T & {state: States | 'Idle'; transitioning?: string} = {
		...data,
		state: 'Idle',
	};
	const st = setupWriteableWithError<T & {state: States | 'Idle'; transitioning?: string}>(d);
	return {
		...st,
		transitioningTo(message: string, obj?: Partial<T>) {
			st.assign({transitioning: message, ...obj} as any);
		},
		setState(state: States | 'Idle', obj?: Partial<T>) {
			st.assign({state, transitioning: undefined, ...obj} as any);
		},
	};
}
