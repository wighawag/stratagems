<script>
	import {syncing} from '$lib/stratagems/state/State';
</script>

<!-- <span>{JSON.stringify($syncing, null, 2)}</span> -->

<div class="info">
	<div>Indexing...</div>
	<progress value={$syncing?.syncPercentage || 0} max="100"></progress>
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
