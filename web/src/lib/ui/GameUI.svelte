<script lang="ts">
	import Web3ConnectionUI from '$lib/blockchain/connection/Web3ConnectionUI.svelte';
	import ActionPanel from '$lib/actions/ActionPanel.svelte';
	import Epoch from '$lib/ui/components/Epoch.svelte';
	import Flow from '$lib/actions/flow/Flow.svelte';
	import FactionPicker from '$lib/actions/FactionPicker.svelte';
	import CameraInfo from '$utils/debug/CameraInfo.svelte';
</script>

<CameraInfo />

<Epoch></Epoch>

<ActionPanel />

<Flow />

<Web3ConnectionUI />

<FactionPicker />
