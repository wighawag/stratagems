<script lang="ts">
	import ActualLeaderboardView from './ActualLeaderboardView.svelte';
	import {leaderboardView} from './leaderboardView';
</script>

{#if $leaderboardView.open}
	<ActualLeaderboardView />
{/if}
