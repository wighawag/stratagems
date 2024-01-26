<script lang="ts">
	import Web3Connection from './Web3Connection.svelte';
	import Modals from '$utils/components/modals/Modals.svelte';
	import {connection, pendingActions, account, network, execution} from './';
</script>

<Web3Connection {connection} {pendingActions} {account} {network} {execution} />

<Modals />
