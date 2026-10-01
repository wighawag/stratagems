<script lang="ts">
	import {connection, account, network} from './';
	import ImgBlockie from '$utils/ethereum/ImgBlockie.svelte';
	import {contractsInfos} from '$lib/config';
	import {menu} from '$lib/ui/menu/menu';
	import {tour} from '$lib/ui/tour/drive';
	import {getWalletSwitchChainInfo} from '$lib/blockchain/networks';
	import {conversations} from '$lib/ui/missiv/missiv';

	$: conversationsView = $conversations.conversations;

	$: messageNotif = $conversationsView ? $conversationsView.numUnread + $conversationsView.numUnaccepted : 0;

	function switchMenu(e: Event) {
		menu.update((v) => ({
			open: !v.open,
		}));
		e.stopPropagation();
		e.preventDefault();
	}

	$: connecting =
		$connection.connecting || $account.fetching || $network.loading || $account.isLoadingData != undefined;
</script>

{#if $account.state === 'Disconnected' || $account.locked}
	<div class="disconnected">
		{#if $account.locked}
			<button class="primary" disabled={$account.unlocking} on:click={() => account.unlock()}>unlock</button>
		{:else}
			<button
				disabled={connecting}
				class={`${$connection.initialised ? '' : 'invisible'} primary`}
				on:click={() => connection.connect()}>{connecting ? 'Connecting' : 'Connect'}</button
			>
		{/if}
	</div>
{:else}
	<div class="connected">
		{#if $network.notSupported}
			<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
			<!-- svelte-ignore a11y-label-has-associated-control -->
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<svg
				role="button"
				tabindex="0"
				on:click={() => network.switchTo($contractsInfos.chainId, getWalletSwitchChainInfo($contractsInfos.chainInfo))}
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="font-icon"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
				/>
			</svg>
		{/if}
		<button disabled={$tour.running} id="account-button" class="blockie-button" on:click={(e) => switchMenu(e)}>
			<div class="blockie-wrapper">
				{#if messageNotif > 0}
					<span class="notification-badge">{messageNotif}</span>
				{/if}
				<ImgBlockie rootClass="blockie" address={$account.address || ''} />
			</div>
		</button>
	</div>
{/if}

<style>
	.notification-badge {
		position: absolute;
		background-color: red;
		border-radius: 9999px;
		padding-inline: 0.3rem;
		padding-block: 0.2rem;
		font-size: 1.2rem;
	}
	.connected {
		text-align: right;
		width: 5.5rem;
		height: 3rem;
	}

	.disconnected {
		display: flex;
		place-items: center;
		height: 3rem;
	}

	.dropdown {
		display: inline;
	}

	.font-icon {
		width: 2rem;
		height: 2rem;
	}

	.blockie-button {
		background-color: inherit;
		width: 3rem;
		height: 3rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding-inline: revert;
	}
	.blockie-wrapper {
		border-radius: 9999px;
		overflow: hidden;

		aspect-ratio: 1 / 1;
		width: 2.5rem;
	}

	.blockie-wrapper :global(.blockie) {
		object-fit: cover;
		height: 100%;
		width: 100%;
	}
</style>
