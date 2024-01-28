<script lang="ts">
	import '../css/index.css';
	// import {dev} from '$app/environment';
	// import NoInstallPrompt from '$utils/components/web/NoInstallPrompt.svelte';
	// import {url} from '$utils/path';
	// import {initialContractsInfos, params} from '$lib/config';
	import EraseNotice from '$lib/ui/components/EraseNotice.svelte';
	import ClaimTokenScreen from '$lib/actions/claim/ClaimTokenScreen.svelte';
	import WipNotice from '$lib/ui/components/WipNotice.svelte';
	import Head from './Head.svelte';
	import Banners from '$utils/ui/banners/Banners.svelte';
	import VersionAndInstallNotfications from '$lib/ui/install/VersionAndInstallNotfications.svelte';
	import Modals from '$utils/ui/modals/Modals.svelte';
	import {url} from '$utils/path';
</script>

<!-- add head, meta, sentry and other debug utilties-->
<Head />
<!-- -->

<div style="position: absolute; z-index: 1; width: 100%; height: 100%; pointer-events: none;">
	<!-- then add the UI components -->
	<Banners />

	<VersionAndInstallNotfications src={url('/icon.png')} alt="Stratagems" />

	<!-- <WipNotice /> -->

	<EraseNotice />

	<div class="fullscreen">
		<ClaimTokenScreen name="Stratagems" />
	</div>

	<Modals />
</div>

<div style="position: absolute; z-index: 0; width: 100%; height: 100%; pointer-events: none;">
	<slot />
</div>
