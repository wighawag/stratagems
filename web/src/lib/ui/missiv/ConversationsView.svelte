<script lang="ts">
	import ImgBlockie from '$utils/ethereum/ImgBlockie.svelte';
	import FullScreenModal from '../FullScreenModal.svelte';

	import type {ConversationState, ConversationsViewState} from 'missiv-client';
	import type {Readable} from 'svelte/store';
	import {playerView} from './playerView';
	import {openConversations} from './missiv';

	export let conversations: Readable<ConversationsViewState>;
</script>

<FullScreenModal oncancel={() => ($openConversations.open = false)}>
	{#if $conversations.loading}
		loading...
	{:else}
		<h1>Conversations</h1>
		<ul>
			{#each $conversations.conversations as conversation}
				<!-- svelte-ignore a11y-missing-attribute -->
				<!-- svelte-ignore a11y-interactive-supports-focus -->
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<a role="button" on:click={() => ($playerView.player = conversation.second)}
					><li>
						<ImgBlockie style="width:32px;height:32px; display: inline-block;" address={conversation.second} />
						{conversation.second}
					</li>
				</a>
			{:else}
				No Conversations
			{/each}
		</ul>
	{/if}
</FullScreenModal>

<style>
	h1 {
		margin-bottom: 2rem;
	}
	li {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
</style>
