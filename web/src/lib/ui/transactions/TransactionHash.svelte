<script lang="ts">
	import {blockchainExplorer} from '$lib/config';

	export let hash: `0x${string}`;

	function computeShortHash(hash: `0x${string}`) {
		return hash.slice(0, 8) + '...';
	}

	$: href = `${blockchainExplorer}/tx/${hash}`;
	$: shortHash = computeShortHash(hash);
</script>

<a {href} target="_blank" rel="noreferer noopener">{shortHash}</a>

<style>
	a {
		text-decoration: underline;
	}
</style>
