<script lang="ts">
	import {currentFlow} from '$lib/ui/flows';
	import Modal from '$utils/components/modals/Modal.svelte';

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
			const newState = await currentStep.execute($state);
			$state = newState;
			$currentStepIndex++;
		} else {
			currentFlow.cancel();
		}
	}
</script>

{#if $currentFlow && $currentStepIndex !== undefined && $state}
	<Modal>
		<ul class="steps mb-4 text-xs">
			{#each $currentFlow.steps as step, index}
				<li class={`step ${$currentStepIndex > index ? 'step-primary' : ''}`}>{step.title}</li>
			{/each}
		</ul>

		{#if currentStep}
			{#if currentStep.component}
				<svelte:component this={currentStep.component} {state} />
			{:else}
				<p class="py-4">{currentStep.description}</p>
			{/if}
		{/if}
		<div class="mt-4 modal-action justify-end">
			{#if currentStep}
				<button class="btn btn-neutral" on:click={() => cancel()}>Back</button>
			{:else}
				<p>Steps completed</p>
			{/if}
			<button class="btn btn-primary" on:click={() => execute()}>{action}</button>
		</div>
	</Modal>
{/if}
