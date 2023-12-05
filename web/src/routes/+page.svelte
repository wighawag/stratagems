<script lang="ts">
	import Web3ConnectionUI from '$lib/web3/Web3ConnectionUI.svelte';
	import {stratagemsView} from '$lib/blockchain/state/ViewState';
	import ActionPanel from '$lib/ui/panels/ActionPanel.svelte';
	import Epoch from '$lib/components/info/Epoch.svelte';
	import WebGlCanvas from '$lib/render/WebGLCanvas.svelte';
	import Flow from '$lib/ui/flows/Flow.svelte';
	import FactionPicker from '$lib/components/stratagems/FactionPicker.svelte';
</script>

<WebGlCanvas state={stratagemsView} />

<Epoch></Epoch>

<ActionPanel />

<Flow />

<Web3ConnectionUI />

<FactionPicker />
