<script lang="ts">
	import {stratagemsView} from '$lib/state/ViewState';
	import WebGlCanvas from '$lib/render/WebGLCanvas.svelte';

	import Web3ConnectionUI from '$lib/blockchain/connection/Web3ConnectionUI.svelte';
	import ActionPanel from '$lib/actions/ActionPanel.svelte';
	import Epoch from '$lib/ui/components/Epoch.svelte';
	import Flow from '$lib/actions/flow/Flow.svelte';
	import FactionPicker from '$lib/actions/FactionPicker.svelte';
	import CameraInfo from '$utils/debug/CameraInfo.svelte';
	import Header from '$lib/ui/header/Header.svelte';
</script>

<div class="fullscreen">
	<WebGlCanvas state={stratagemsView} />
</div>

<Header />

<div class="fullscreen">
	<CameraInfo />

	<Epoch></Epoch>

	<ActionPanel />

	<Flow />

	<Web3ConnectionUI />

	<FactionPicker />
</div>

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
