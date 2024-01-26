<script lang="ts">
	import '../css/index.css';
	// import {dev} from '$app/environment';
	// import NewVersionNotification from '$utils/components/web/NewVersionNotification.svelte';
	// import NoInstallPrompt from '$utils/components/web/NoInstallPrompt.svelte';
	// import {url} from '$utils/path';
	// import {initialContractsInfos, params} from '$lib/config';
	// import Header from '$lib/ui/structure/Header.svelte';
	// import EraseNotice from '$utils/components/utilities/EraseNotice.svelte';
	// import ClaimTokenScreen from '$utils/components/claim/ClaimTokenScreen.svelte';
	// import WipNotice from '$utils/components/utilities/WipNotice.svelte';
	import Head from './Head.svelte';
	import Banners from '$utils/ui/banners/Banners.svelte';
	import VersionAndInstallNotfications from '$lib/ui/install/VersionAndInstallNotfications.svelte';
	import Modals from '$utils/ui/modals/Modals.svelte';
	import {url} from '$utils/path';
</script>

<!-- add head, meta, sentry and other debug utilties-->
<Head />
<!-- -->

<slot />

<!-- then add the UI components -->
<Banners />

<div class="fullscreen">
	<VersionAndInstallNotfications src={url('/icon.png')} alt="Stratagems" />
</div>

<Modals />

<style>
	.fullscreen {
		pointer-events: none;
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		width: 100%;
	}
</style>
