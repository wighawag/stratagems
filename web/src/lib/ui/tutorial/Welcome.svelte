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
			<h1>Welcome to Stratagems!</h1>
			<p>
				where players ascend to the divine realm as actual gods, shaping the world island by island. Here, the currency
				of power is not mere gold or silver, but {initialContractsInfos.contracts.Stratagems.linkedData.currency
					.symbol}, deposited by players as they decide which factions will reign over each land. Prepare to immerse
				yourself in a realm where alliances are forged, battles are waged, and fortunes are won or lost with every
				strategic move.
			</p>
			<p>
				At its core, Stratagems is a social game of coordination set in an infinite world, where the fate of each land
				is determined by the factions that inhabit it. Every day, players stake {initialContractsInfos.contracts
					.Stratagems.linkedData.currency.symbol} to claim ownership of lands, eagerly awaiting the outcomes of their decisions.
				But in this dynamic landscape, knowledge is power, and those who can anticipate the moves of others gain a significant
				advantage.
			</p>
			<p>
				Yet, the game doesn't end with territorial conquest. Stratagems is a living world, shaped by the actions of its
				players, with the potential for new mechanics to be introduced, offering infinite possibilities to its
				inhabitants. Will you rise to become a legendary deity, shaping the destiny of this ever-evolving world? The
				choice is yours, and the adventure awaits. Welcome to Stratagems.
			</p>

			<hr />

			{#if welcomeConnected}
				<p>Let's have a look at how you can play the game. Follow our tour or skip it.</p>
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
	.content {
		font-size: larger;
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
