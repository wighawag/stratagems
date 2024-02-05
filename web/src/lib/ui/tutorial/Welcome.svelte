<script>
	import {accountData} from '$lib/blockchain/connection';
	import Modal from '$utils/ui/modals/Modal.svelte';
	import {JsonView} from '@zerodevx/svelte-json-view';
	import {TUTORIAL_STEP, hasCompletedTutorial} from './tutorial';

	const offchainState = accountData.offchainState;
</script>

{#if !hasCompletedTutorial($offchainState.tutorial.progression, TUTORIAL_STEP.WELCOME)}
	<Modal>
		<JsonView json={$offchainState} />
	</Modal>
{/if}
