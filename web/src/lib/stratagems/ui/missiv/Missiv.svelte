<script lang="ts">
	import ConversationsView from './ConversationsView.svelte';
	import Player from './Player.svelte';
	import {openConversations, conversations} from './missiv';
	import {playerView} from './playerView';
</script>

{#if $openConversations.open && $conversations.conversations}
	<ConversationsView conversations={$conversations.conversations} />
{/if}

{#if $playerView.player}
	<Player address={$playerView.player} />
{/if}
