<script lang="ts">
	import ImgBlockie from '$utils/ethereum/ImgBlockie.svelte';
	import {afterUpdate} from 'svelte';
	import FullScreenModal from '../FullScreenModal.svelte';
	import {conversations} from './missiv';
	import {playerView} from './playerView';

	export let address: `0x${string}`;

	let messageList: Element;

	$: currentConversation = conversations.openConversation(address, true);

	$: messages = $currentConversation.messages?.reverse() || [];

	let text: string;
	async function sendMessage() {
		await currentConversation.sendMessage(text);
		text = '';
	}

	function handleShiftEnter(evt: KeyboardEvent) {
		if (evt.keyCode == 13 && evt.shiftKey) {
			sendMessage();
		}
	}

	let numMessages: number = 0;
	afterUpdate(() => {
		if (messageList) {
			const newNumMessages = messages.length;
			if (numMessages < newNumMessages) {
				numMessages = newNumMessages;
				messageList.scrollTo(0, messageList.scrollHeight);
			}
		}
	});
</script>

<FullScreenModal oncancel={() => ($playerView.player = undefined)}>
	<div class="wrapper">
		<ImgBlockie style="width:32px;height:32px;" {address} />
		<br />
		<h2>Messages with {$currentConversation.otherUser.name || address}</h2>
		{#if $currentConversation.invalidUser}
			Please switch back to User or close
		{:else if $currentConversation.loading !== 'done'}
			loading...
		{:else}
			<ul bind:this={messageList}>
				{#each messages as message}
					<li class:their={message.sender.toLowerCase() == address.toLowerCase()}>
						<ImgBlockie style="width:32px;height:32px;display: inline-block;order: 2;" address={message.sender} />
						<p class="message">{message.message}</p>
					</li>
				{:else}
					No messages
				{/each}
			</ul>
			{#if !$currentConversation.otherUser.publicKey}
				<p class="error">This player did not make his public key known. You can send message in clear if you wish</p>
			{/if}
			<form on:submit={sendMessage}>
				<label for="textarea">Your Message</label>
				<textarea class="input" id="textarea" bind:value={text} on:keypress={handleShiftEnter}></textarea>
				<button type="submit">Send</button>
			</form>
		{/if}
	</div>
</FullScreenModal>

<style>
	.wrapper {
		height: 100%;
	}
	ul {
		height: 65%;
		overflow: auto;
		margin-top: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	li {
		background-color: var(--color-surface-700);
		display: flex;
		/* flex-direction: row-reverse; */
		gap: 1rem;
		border-radius: 1rem;
		padding-inline: 1rem;
		padding-block: 0.5rem;
		width: 90%;
		list-style: none;
		align-self: end;
	}
	.their {
		align-self: start;
		/* flex-direction: row; */
		background-color: var(--color-surface-600);
	}

	.their .message {
		order: 2;
	}
	.message {
		margin-right: auto;
		white-space: pre-wrap;
	}

	form {
		margin-top: 1rem;
	}

	.input {
		margin-top: 1rem;
		width: 100%;
		font-size: 16px;
		font-size: max(16px, 1em);
		font-family: inherit;
		padding: 0.25em 0.5em;
		background-color: var(--color-surface-700);
		border: 2px solid var(--input-border);
		border-radius: 4px;
	}
</style>
