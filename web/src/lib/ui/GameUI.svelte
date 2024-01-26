<script lang="ts">
	import Web3ConnectionUI from '$lib/blockchain/connection/Web3ConnectionUI.svelte';
	import ActionPanel from '$lib/actions/ActionPanel.svelte';
	import Epoch from '$utils/components/info/Epoch.svelte';
	import Flow from '$lib/actions/flow/Flow.svelte';
	import FactionPicker from '$utils/components/stratagems/FactionPicker.svelte';
	import CameraInfo from '$utils/components/debug/CameraInfo.svelte';
</script>

<CameraInfo />

<Epoch></Epoch>

<ActionPanel />

<Flow />

<Web3ConnectionUI />

<FactionPicker />
