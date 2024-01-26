<script>
	import ConnectButton from '$lib/blockchain/connection/ConnectButton.svelte';
</script>

<main>
	<div class="top-bar">
		<slot name="title" />

		<ConnectButton />
	</div>

	<slot />
</main>

<style>
	main {
		margin: 1em;
	}

	.top-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem;
	}
</style>
