<script lang="ts">
	import {currentFlow} from './';
	import Modal from '$utils/ui/modals/Modal.svelte';

	$: state = $currentFlow?.state;
	$: currentStepIndex = $currentFlow?.currentStepIndex;

	$: currentStep =
		$currentFlow && $currentStepIndex != undefined && $currentStepIndex < $currentFlow.steps.length
			? $currentFlow.steps[$currentStepIndex]
			: undefined;
	$: action = currentStep ? currentStep.action : 'done';

	function cancel() {
		currentFlow.cancel();
	}

	async function execute() {
		if ($currentStepIndex != undefined && currentStep) {
			const {newState, nextStep} = await currentStep.execute($state);
			$state = newState;
			if (nextStep) {
				$currentStepIndex = nextStep;
			} else {
				$currentStepIndex++;
			}
			if ($currentFlow) {
				// TODO recursive
				const newStep = $currentFlow.steps[$currentStepIndex];
				if (newStep && !newStep.action) {
					const {newState, nextStep} = await newStep.execute($currentFlow.state);
					$state = newState;
					if (nextStep) {
						$currentStepIndex = nextStep;
					} else {
						$currentStepIndex++;
					}
				}
			}
		} else {
			currentFlow.cancel();
		}
	}
</script>

{#if $currentFlow && $currentStepIndex !== undefined && $state}
	<Modal oncancel={() => cancel()}>
		{#if currentStep}
			<div class="title">
				{currentStep.title}
			</div>
			{#if currentStep.component}
				<svelte:component this={currentStep.component} {state} />
			{:else}
				<p class="description">{currentStep.description}</p>
			{/if}
		{/if}

		{#if !currentStep || currentStep.action}
			<div class="actions">
				{#if currentStep}
					<button on:click={() => cancel()}>Back</button>
				{:else}
					<p>Steps completed</p>
				{/if}
				<button class="primary" on:click={() => execute()}>{action}</button>
			</div>
		{:else}
			<p>Please wait...</p>
		{/if}
	</Modal>
{/if}

<style>
	.title {
		font-weight: bold;
		font-size: clamp(1rem, 4vw, 1.25rem);
		margin-bottom: 2rem;
	}

	.description {
		margin-bottom: 1rem;
	}
</style>
