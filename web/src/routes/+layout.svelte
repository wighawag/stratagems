<script lang="ts">
	import '../css/index.css';
	import EraseNotice from '$lib/ui/components/EraseNotice.svelte';
	import ClaimTokenScreen from '$lib/actions/claim/ClaimTokenScreen.svelte';
	import WipNotice from '$lib/ui/components/WipNotice.svelte';
	import Banners from '$utils/ui/banners/Banners.svelte';
	import VersionAndInstallNotfications from '$lib/ui/install/VersionAndInstallNotfications.svelte';
	import Modals from '$utils/ui/modals/Modals.svelte';
	import {url} from '$utils/path';
	import Web3ConnectionUI from '$lib/blockchain/connection/Web3ConnectionUI.svelte';
	import Flow from '$lib/actions/flow/Flow.svelte';

	import {dev, initialContractsInfos, params} from '$lib/config';
	import Head from './Head.svelte';
	import Menu from '$lib/ui/menu/Menu.svelte';
	import TransactionsView from '$lib/ui/transactions/TransactionsView.svelte';
	import Admin from '$lib/ui/admin/Admin.svelte';
	import CommitmentsView from '$lib/ui/commitments/CommitmentsView.svelte';
	import IndexerView from '$lib/ui/indexer/IndexerView.svelte';
	import ViewStateView from '$lib/ui/viewstate/ViewStateView.svelte';
	import Welcome from '$lib/ui/tutorial/Welcome.svelte';
	import SplashScreen from '$lib/ui/loading/SplashScreen.svelte';
	import Debug from '$lib/ui/debug/Debug.svelte';
	import EventsView from '$lib/ui/events/EventsView.svelte';
	import RevealPhaseInformation from '$lib/ui/information/RevealPhaseInformation.svelte';
	import Missiv from '$lib/ui/missiv/Missiv.svelte';
	import LeaderboardView from '$lib/ui/leaderboard/LeaderboardView.svelte';

	$: showWIPNotice =
		!dev &&
		!params['force'] &&
		(initialContractsInfos as any).name !== 'composablelabs' &&
		(initialContractsInfos as any).name !== 'redstone-holesky' &&
		(initialContractsInfos as any).name !== 'fast' &&
		(initialContractsInfos as any).name !== 'sepolia' &&
		(initialContractsInfos as any).name !== 'alpha1test' &&
		(initialContractsInfos as any).name !== 'alpha1';
</script>

<!-- add head, meta, sentry and other debug utilties-->
<Head />
<!-- -->

<div style="position: absolute; z-index: 2; width: 100%; height: 100%; pointer-events: none;overflow: hidden;">
	<ClaimTokenScreen name="Stratagems" />

	<Menu />

	<EventsView />

	<TransactionsView />

	<CommitmentsView />

	<LeaderboardView />

	<IndexerView />

	<ViewStateView />

	<Missiv />

	<Welcome />

	<Admin />

	<Debug />

	<RevealPhaseInformation />

	<Modals />

	<Banners />

	<VersionAndInstallNotfications src={url('/icon.png')} alt="Stratagems" />

	{#if showWIPNotice}
		<WipNotice />
	{/if}

	<EraseNotice />

	<Web3ConnectionUI />

	<Flow />

	<SplashScreen />
</div>

<slot />
