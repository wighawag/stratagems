<script>
	import {account, accountData, connection, network} from '$lib/blockchain/connection';
	import Modal from '$utils/ui/modals/Modal.svelte';
	import {JsonView} from '@zerodevx/svelte-json-view';
	// import Typewriter from '$utils/ui/text/Typewriter.svelte';
	import {TUTORIAL_STEP, hasCompletedTutorial} from '$lib/account/account-data';
	import {startTour} from '../tour/drive';
	import {defaultRPC, initialContractsInfos} from '$lib/config';
	import {justObserve} from './observe';
	import tokenClaim from '$lib/actions/claim/tokenClaim';

	const offchainState = accountData.offchainState;

	let tourInProgress = false;
	function next() {
		tourInProgress = true;
	}

	function onclosed() {
		if (tourInProgress) {
			startTour(() => {
				accountData.markTutorialAsComplete(TUTORIAL_STEP.WELCOME);
				tourInProgress = false;
			});
		}
	}

	function skip() {
		accountData.markTutorialAsComplete(TUTORIAL_STEP.WELCOME);
	}
</script>

{#if !$tokenClaim.inUrl && !$network.notSupported && !$account.locked}
	{#if !tourInProgress && $account.state === 'Connected' && !$account.isLoadingData && !hasCompletedTutorial($offchainState.tutorial.progression, TUTORIAL_STEP.WELCOME)}
		<Modal {onclosed}>
			<div class="content">
				<p>
					Welcome my divine soul, to the world of Stratagems. You are a powerful being able to shape it, but be careful
					as you use your power ({initialContractsInfos.contracts.Stratagems.linkedData.currency.symbol}), others will
					not hesitate to capture it.
				</p>

				<p>Let's have a look.</p>

				<button on:click={() => next()}>Continue</button>
				<button on:click={() => skip()}>Skip</button>
			</div>
		</Modal>
	{:else if !$justObserve && $account.state === 'Disconnected' && !$account.unlocking && !$account.isLoadingData && !$account.fetching}
		<Modal>
			<div class="content">
				{#if defaultRPC}
					<p>Welcome to Stratagems, a new world where players like you co-create it.</p>

					<p>
						In order to play this game, you need to connect to a web3 wallet like <a href="https://metamask.o"
							>Metamask</a
						>
					</p>

					<button on:click={() => connection.connect()}>Connect</button>
					<button on:click={() => ($justObserve = true)}>Just Observe</button>
				{:else}
					<p>
						Stratagems is a fully local game and requires a wallet to even read the latest game state. Please Connect to
						a web3 wallet.
					</p>
					<button on:click={() => connection.connect()}>Connect</button>
				{/if}
			</div>
		</Modal>
	{/if}
{/if}

<style>
	.content {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		height: 100%;
	}
</style>
