<script lang="ts">
	import ConversationsView from './ConversationsView.svelte';
	import {openConversations, conversations} from './missiv';
</script>

{#if $openConversations.open && $conversations.conversations}
	<ConversationsView conversations={$conversations.conversations} />
{/if}
