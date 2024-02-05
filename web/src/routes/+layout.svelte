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

	$: showWIPNotice =
		!dev &&
		!params['force'] &&
		initialContractsInfos.chainId + '' !== '8453' &&
		(initialContractsInfos as any).name !== 'composablelabs';
</script>

<!-- add head, meta, sentry and other debug utilties-->
<Head />
<!-- -->

<div style="position: absolute; z-index: 2; width: 100%; height: 100%; pointer-events: none;overflow: hidden;">
	<div class="fullscreen">
		<ClaimTokenScreen name="Stratagems" />
	</div>

	<Menu />

	<TransactionsView />

	<CommitmentsView />

	<IndexerView />

	<Admin />

	<Modals />

	<Banners />

	<VersionAndInstallNotfications src={url('/icon.png')} alt="Stratagems" />

	{#if showWIPNotice}
		<WipNotice />
	{/if}

	<EraseNotice />

	<Web3ConnectionUI />

	<Flow />
</div>

<slot />
