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
			const newState = await currentStep.execute($state);
			$state = newState;
			$currentStepIndex++;
		} else {
			currentFlow.cancel();
		}
	}
</script>

{#if $currentFlow && $currentStepIndex !== undefined && $state}
	<Modal oncancel={() => cancel()}>
		<ul class="steps">
			{#each $currentFlow.steps as step, index}
				<li class={`step ${$currentStepIndex >= index ? 'step-primary' : ''}`}>{step.title}</li>
			{/each}
		</ul>

		{#if currentStep}
			{#if currentStep.component}
				<svelte:component this={currentStep.component} {state} />
			{:else}
				<p class="description">{currentStep.description}</p>
			{/if}
		{/if}
		<div class="actions">
			{#if currentStep}
				<button on:click={() => cancel()}>Back</button>
			{:else}
				<p>Steps completed</p>
			{/if}
			<button class="primary" on:click={() => execute()}>{action}</button>
		</div>
	</Modal>
{/if}

<style>
	.steps {
		display: flex;
		--circle-size: 0.5rem;
		--spacing: 0.5rem;
		--color: var(--color-secondary-500);
	}

	.step.step-primary {
		--circle-size: 1rem;
		--spacing: 0.5rem;
		--color: var(--color-primary-500);
	}

	.step {
		margin-top: -6rem;
		display: flex;
		flex-direction: column;
		flex: 1;
		text-align: center;

		&:before {
			--size: 3rem;
			content: '';
			display: block;
			width: var(--circle-size);
			height: var(--circle-size);
			border-radius: 50%;
			background-color: lightgrey;
			background-color: var(--color);
			opacity: 0.5;
			margin: 0 auto 1rem;
		}

		&:not(:last-child) {
			&:after {
				content: '';
				position: relative;
				top: calc(var(--circle-size) / 2);
				width: calc(100% - var(--circle-size) - calc(var(--spacing) * 2));
				left: calc(50% + calc(var(--circle-size) / 2 + var(--spacing)));
				height: 1px;
				background-color: #e0e0e0;
				order: -1;
			}
		}
	}

	.title {
		font-weight: bold;
		font-size: clamp(1rem, 4vw, 1.25rem);
		margin-bottom: 0.5rem;
	}

	.description {
		margin-bottom: 1rem;
	}
</style>
