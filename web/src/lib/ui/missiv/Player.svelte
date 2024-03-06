<script lang="ts">
	import FullScreenModal from '../FullScreenModal.svelte';
	import {conversations} from './missiv';

	export let address: `0x${string}`;

	$: currentConversation = conversations.openConversation(address);

	let text: string;
	async function sendMessage() {
		await currentConversation.sendMessage(text);
	}
</script>

<FullScreenModal>
	{#if $currentConversation.invalidUser}
		Please switch back to User or close
	{:else}
		{$currentConversation.user?.address} &lt; = &gt; {$currentConversation.otherUser.address}
		{#if $currentConversation.loading !== 'done'}
			loading...
		{:else}
			{#each $currentConversation.messages as message}
				{message.message}
			{:else}
				No messages
			{/each}

			<input type="text" bind:value={text} />
			<button on:click={() => sendMessage()}></button>
		{/if}
	{/if}
</FullScreenModal>
