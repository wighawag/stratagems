<script>
	import {syncing} from '$lib/state/State';
</script>

<!-- <span>{JSON.stringify($syncing, null, 2)}</span> -->

<div class="info">
	<div>Indexing...</div>
	<progress value={$syncing.lastSync?.syncPercentage || 0} max="100" />
</div>

<style>
	.info {
		width: 100%;
		display: flex;
		flex-direction: column;
	}
	progress {
		width: 100%;
	}
</style>
