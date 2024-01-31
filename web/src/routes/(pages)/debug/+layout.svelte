<script lang="ts">
	import Header from '$lib/ui/header/Header.svelte';
	import NavTabs from '$utils/navigation/NavTabs.svelte';
</script>

<div>
	<NavTabs
		pages={[
			{pathname: '/debug/indexer/', title: 'Indexer'},
			{pathname: '/debug/contracts/', title: 'Contracts'},
			{pathname: '/debug/transactions/', title: 'Transactions'},
			{pathname: '/debug/utilities/', title: 'Utilities'},
		]}
	/>
</div>

<slot />
