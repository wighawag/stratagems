<script lang="ts">
	import type {ConversationState} from 'missiv-client';
	import type {Readable} from 'svelte/store';

	export let conversation: Readable<ConversationState>;
</script>

{#if $conversation.loading}
	loading
{:else}
	{#each $conversation.messages as message}
		{message.message}
	{:else}
		No messages
	{/each}

	<input type="text" />
{/if}
