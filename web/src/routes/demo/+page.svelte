<script lang="ts">
	import ConnectButton from '$lib/web3/ConnectButton.svelte';
	import Web3ConnectionUI from '$lib/web3/Web3ConnectionUI.svelte';
	import {account, connection, network, contracts} from '$lib/web3';
	import {status, state} from '$lib/blockchain/state/State';
	// import {pendingState} from '$lib/blockchain/state/PendingState';
	import {viewState} from '$lib/state/ViewState';
	import ActionPanel from '$lib/ui/panels/ActionPanel.svelte';
	import CommitConfirmationModal from '$lib/ui/modals/CommitConfirmationModal.svelte';
	import Epoch from '$lib/components/info/Epoch.svelte';
	import PixiCanvas from '$lib/render/PIXICanvas.svelte';
</script>

<PixiCanvas state={viewState} />

<Epoch></Epoch>

<ActionPanel />

<CommitConfirmationModal />

<Web3ConnectionUI />
