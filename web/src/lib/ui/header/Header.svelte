<script lang="ts">
	import ConnectButton from '$lib/blockchain/connection/ConnectButton.svelte';
	import PageLink from './PageLink.svelte';
</script>

<header>
	<div class="top">
		<nav>
			<ol>
				<li><PageLink href={'/'}>World</PageLink></li>
				<li><PageLink href={'/debug/'}>Debug</PageLink></li>
				<li><PageLink href={'/about/'}>About</PageLink></li>
			</ol>
		</nav>
		<ConnectButton></ConnectButton>
	</div>
	<div class="under">
		<slot />
	</div>
</header>

<style>
	header {
		top: 0;
		position: sticky;
	}

	.top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px;
		background-color: var(--color-surface-500);
		border-bottom: 4px solid var(--color-primary-500);
	}

	nav ol {
		display: flex;
		justify-content: flex-start;
		margin: 0;
		list-style-type: none;
	}
</style>
