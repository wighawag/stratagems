<script lang="ts">
	import '../css/index.css';
	import EraseNotice from '$lib/stratagems/ui/components/EraseNotice.svelte';
	import ClaimTokenScreen from '$lib/stratagems/actions/claim/ClaimTokenScreen.svelte';
	import WipNotice from '$lib/stratagems/ui/components/WipNotice.svelte';
	import Banners from '$utils/ui/banners/Banners.svelte';
	import VersionAndInstallNotfications from '$lib/stratagems/ui/install/VersionAndInstallNotfications.svelte';
	import Modals from '$utils/ui/modals/Modals.svelte';
	import {url} from '$utils/path';
	import Web3ConnectionUI from '$lib/stratagems/blockchain/connection/Web3ConnectionUI.svelte';
	import Flow from '$lib/stratagems/actions/flow/Flow.svelte';

	import {dev, initialContractsInfos, params} from '$lib/stratagems/config';
	import Head from './Head.svelte';
	import Menu from '$lib/stratagems/ui/menu/Menu.svelte';
	import TransactionsView from '$lib/stratagems/ui/transactions/TransactionsView.svelte';
	import Admin from '$lib/stratagems/ui/admin/Admin.svelte';
	import CommitmentsView from '$lib/stratagems/ui/commitments/CommitmentsView.svelte';
	import IndexerView from '$lib/stratagems/ui/indexer/IndexerView.svelte';
	import ViewStateView from '$lib/stratagems/ui/viewstate/ViewStateView.svelte';
	import Welcome from '$lib/stratagems/ui/tutorial/Welcome.svelte';
	import SplashScreen from '$lib/stratagems/ui/loading/SplashScreen.svelte';
	import Debug from '$lib/stratagems/ui/debug/Debug.svelte';
	import EventsView from '$lib/stratagems/ui/events/EventsView.svelte';
	import RevealPhaseInformation from '$lib/stratagems/ui/information/RevealPhaseInformation.svelte';
	import Missiv from '$lib/stratagems/ui/missiv/Missiv.svelte';
	import LeaderboardView from '$lib/stratagems/ui/leaderboard/LeaderboardView.svelte';

	$: showWIPNotice =
		!dev &&
		!params['force'] &&
		(initialContractsInfos as any).name !== 'composablelabs' &&
		(initialContractsInfos as any).name !== 'redstone-holesky' &&
		(initialContractsInfos as any).name !== 'fast' &&
		(initialContractsInfos as any).name !== 'sepolia' &&
		(initialContractsInfos as any).name !== 'alpha1test';
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
