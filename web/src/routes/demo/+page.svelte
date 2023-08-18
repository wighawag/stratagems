<script lang="ts">
	import ConnectButton from '$lib/web3/ConnectButton.svelte';
	import Web3ConnectionUI from '$lib/web3/Web3ConnectionUI.svelte';
	import {account, connection, network, contracts} from '$lib/web3';
	import {status, state} from '$lib/blockchain/state/State';
	// import {pendingState} from '$lib/blockchain/state/PendingState';
	import {viewState} from '$lib/state/ViewState';
	import WebGlCanvas from '$lib/render/WebGLCanvas.svelte';
	import ActionPanel from '$lib/ui/panels/ActionPanel.svelte';
	import CommitConfirmationModal from '$lib/ui/modals/CommitConfirmationModal.svelte';
</script>

<WebGlCanvas state={viewState} />

<ActionPanel />

<CommitConfirmationModal />

<!-- <div class="navbar bg-base-100">
	<div class="navbar-start">
		<span class="normal-case text-xl">Demo</span>
	</div>
	<div class="navbar-center hidden lg:flex" />
	<div class="navbar-end">
		<ConnectButton />
	</div>
</div> -->

<Web3ConnectionUI />
