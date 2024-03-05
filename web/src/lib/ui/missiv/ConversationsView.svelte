<script lang="ts">
	import FullScreenModal from '../FullScreenModal.svelte';

	import type {ConversationState, ConversationsViewState} from 'missiv-client';
	import type {Readable} from 'svelte/store';

	export let conversations: Readable<ConversationsViewState>;
</script>

<FullScreenModal>
	{#if $conversations.loading}
		loading...
	{:else}
		{#each $conversations.conversations as conversation}
			<span>{conversation.state}</span>
			<p>
				{conversation.second}: {conversation.conversationID}
			</p>
		{:else}
			No Conversations
		{/each}
	{/if}
</FullScreenModal>
