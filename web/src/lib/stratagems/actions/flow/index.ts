import type {ComponentType} from 'svelte';
import {get, writable, type Writable} from 'svelte/store';

export type Step<State> = {
	title: string;
	action?: string;
	description: string;
	component?: ComponentType;
	execute(state: State): Promise<{newState: State; nextStep?: number; auto?: boolean}>;
	end?: boolean;
};

export type Flow<State> = {
	type: string;
	steps: Step<State>[];
	state: Writable<State>;
	currentStepIndex: Writable<number>;
	completionMessage?: string;
};

export type FlowState = Flow<any> | undefined;

export function initFlow() {
	const store = writable<FlowState>(undefined);

	return {
		subscribe: store.subscribe,
		async start(flow: Flow<any>) {
			let currentStep: Step<any> | undefined;
			async function next() {
				if (!currentStep) {
					currentStep = flow.steps[0];
				} else {
					currentStep = flow.steps[get(flow.currentStepIndex)];
				}
				if (currentStep) {
					const {newState, nextStep, auto} = await currentStep.execute(get(flow.state));
					flow.state.set(newState);
					flow.currentStepIndex.update((v) => {
						if (nextStep) {
							v = nextStep;
						} else {
							v++;
						}

						return v;
					});
					if (auto) {
						next();
					}
				} else {
					store.set(undefined);
				}
			}

			store.set(flow);

			if (!flow.steps[0].action) {
				next();
			}
		},
		cancel() {
			console.log('canceling flow');
			store.set(undefined);
		},
	};
}

export const currentFlow = initFlow();
