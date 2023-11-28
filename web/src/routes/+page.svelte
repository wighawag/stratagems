<script lang="ts">
	import Web3ConnectionUI from '$lib/web3/Web3ConnectionUI.svelte';
	import {viewState} from '$lib/blockchain/state/ViewState';
	import ActionPanel from '$lib/ui/panels/ActionPanel.svelte';
	import Epoch from '$lib/components/info/Epoch.svelte';
	import WebGlCanvas from '$lib/render/WebGLCanvas.svelte';
	import Flow from '$lib/ui/flows/Flow.svelte';
</script>

<WebGlCanvas state={viewState} />

<Epoch></Epoch>

<ActionPanel />

<Flow />

<Web3ConnectionUI />
