import type {ComponentType} from 'svelte';
import {writable, type Writable} from 'svelte/store';

export type Step<State> = {
	title: string;
	action: string;
	description: string;
	component?: ComponentType;
	execute(state: State): Promise<State>;
};

export type Flow<State> = {
	type: string;
	steps: Step<State>[];
	state: Writable<State>;
	currentStepIndex: Writable<number>;
};

export type FlowState = Flow<any> | undefined;

export function initFlow() {
	const store = writable<FlowState>(undefined);

	return {
		subscribe: store.subscribe,
		start(flow: Flow<any>) {
			store.set(flow);
		},
		cancel() {
			console.log('canceling flow');
			store.set(undefined);
		},
	};
}

export const currentFlow = initFlow();
