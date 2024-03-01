import type {ComponentType} from 'svelte';
import {get, writable, type Writable} from 'svelte/store';

export type Step<State> = {
	title: string;
	action?: string;
	description: string;
	component?: ComponentType;
	execute(state: State): Promise<{newState: State; nextStep?: number}>;
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
		async start(flow: Flow<any>) {
			store.set(flow);
			const currentStep = flow.steps[0];
			if (!currentStep.action) {
				const {newState, nextStep} = await currentStep.execute(get(flow.state));
				flow.state.set(newState);
				flow.currentStepIndex.update((v) => {
					if (nextStep) {
						v = nextStep;
					} else {
						v++;
					}
					return v;
				});
			}
		},
		cancel() {
			console.log('canceling flow');
			store.set(undefined);
		},
	};
}

export const currentFlow = initFlow();
