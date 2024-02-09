<script>
	import {account, accountData, connection, network} from '$lib/blockchain/connection';
	import {JsonView} from '@zerodevx/svelte-json-view';
	// import Typewriter from '$utils/ui/text/Typewriter.svelte';
	import {TUTORIAL_STEP, hasCompletedTutorial} from '$lib/account/account-data';
	import {startTour} from '../tour/drive';
	import {defaultRPC, initialContractsInfos} from '$lib/config';
	import {justObserve} from './observe';
	import tokenClaim from '$lib/actions/claim/tokenClaim';
	import WelcomeContainer from './WelcomeContainer.svelte';

	$: welcomeDisconnected =
		!$justObserve &&
		$account.state === 'Disconnected' &&
		!$account.unlocking &&
		!$account.isLoadingData &&
		!$account.fetching;
	$: welcomeConnected =
		!tourInProgress &&
		$account.state === 'Connected' &&
		!$account.isLoadingData &&
		!hasCompletedTutorial($offchainState.tutorial.progression, TUTORIAL_STEP.WELCOME);

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
	{#if welcomeConnected || welcomeDisconnected}
		<WelcomeContainer {onclosed}>
			<h1>Welcome!</h1>
			<p>
				Stratagems is a permission-less and persistent game (a.k.a an "Autonomous World") where you play the role of a
				god that use any of the 5 different faction to create island on an endless sea.
			</p>
			<p>
				To do so you deposit {initialContractsInfos.contracts.Stratagems.linkedData.currency.symbol} with the hope to get
				more from other player.
			</p>
			<p>
				You can read about the specific rule in our <a
					href="https://stratagems.world/"
					target="_blank"
					rel="noreferer noopener">docs</a
				>.
			</p>

			<hr />

			{#if welcomeConnected}
				<p>We setup a little tour of our interface. Follow it or skip it.</p>
			{:else if welcomeDisconnected}
				{#if defaultRPC}
					<p>
						In order to play this game, you need to connect to a web3 wallet like <a
							href="https://metamask.io"
							target="_blank"
							rel="noopener noreferer">Metamask</a
						>
					</p>
				{:else}
					<p>
						Stratagems is a fully local game and requires a wallet to even read the latest game state. Please Connect to
						a web3 wallet.
					</p>
				{/if}
			{/if}

			<div class="actions" slot="actions">
				{#if welcomeConnected}
					<button on:click={() => next()}>Tour</button>
					<button on:click={() => skip()}>Skip</button>
				{:else if welcomeDisconnected}
					{#if defaultRPC}
						<button on:click={() => connection.connect()}>Connect</button>
						<button on:click={() => ($justObserve = true)}>Just Observe</button>
					{:else}
						<button on:click={() => connection.connect()}>Connect</button>
					{/if}
				{/if}
			</div>
		</WelcomeContainer>
	{/if}
{/if}

<style>
	h1 {
		margin-top: 1rem;
	}
	p {
		margin-top: 1rem;
	}

	.actions {
		width: 100%;
		display: flex;
		gap: 1rem;
		justify-content: end;
	}

	hr {
		border-color: var(--color-primary-500);
		margin: 2rem;
	}
</style>
