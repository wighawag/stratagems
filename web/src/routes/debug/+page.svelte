<script lang="ts">
	import {goto} from '$app/navigation';
	import {route} from '$utils/path';
	import {onMount} from 'svelte';

	onMount(() => {
		goto(route('/debug/indexer/'));
	});
</script>
