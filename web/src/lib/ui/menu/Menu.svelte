<script lang="ts">
	import {account, connection, contracts, network} from '$lib/blockchain/connection';
	import {menu} from './menu';
	import {fly} from 'svelte/transition';
	import {Power} from 'lucide-svelte';
	import ImgBlockie from '$utils/ethereum/ImgBlockie.svelte';
	import {balance} from '$lib/state/balance';
	import {formatUnits} from 'viem';
	import {initialContractsInfos} from '$lib/config';

	$: tokenAllowanceUsed = $balance.tokenAllowance > 0n;

	const symbol = initialContractsInfos.contracts.Stratagems.linkedData.currency.symbol;
	$: currentReserve = $balance.reserve;
	$: currentReserveString = formatUnits(
		currentReserve,
		Number(initialContractsInfos.contracts.Stratagems.linkedData.currency.decimals.slice(0, -1)),
	);

	$: currentBalance = $balance.tokenBalance;
	$: currentBalnceString = formatUnits(
		currentBalance,
		Number(initialContractsInfos.contracts.Stratagems.linkedData.currency.decimals.slice(0, -1)),
	);

	function clearAllowance() {
		contracts.execute(async ({contracts, account}) => {
			await contracts.TestTokens.write.approve([contracts.Stratagems.address, 0n], {account: account.address});
		});
	}

	function disconnect() {
		connection.disconnect();
	}

	function clickOutside(event: MouseEvent) {
		event.stopPropagation();
		event.preventDefault();
		$menu.open = false;
	}

	function prevent(event: MouseEvent) {
		event.stopPropagation();
		event.preventDefault();
	}

	$: connecting =
		$connection.connecting || $account.fetching || $network.loading || $account.isLoadingData != undefined;
</script>

{#if $menu.open}
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<div class="menu-wrapper" on:click={clickOutside}>
		<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<div tabindex="0" class="menu" transition:fly={{x: '100%'}} on:click={prevent}>
			{#if $account.state === 'Connected' && !$account.locked}
				<div class="connected">
					<div class="account">
						<ImgBlockie
							address={$account.address}
							style="object-fit: cover;height: 2rem;width: 2rem;display: inline;transform:translateY(25%);"
						/>
						<span>{$account.address.slice(0, 6)}...</span>
					</div>
					<button
						on:click={() => {
							$menu.open = false;
							disconnect();
						}}
						class="icon"
					>
						<Power></Power>
					</button>
				</div>

				<div class="category">
					<div>Tokens</div>
					<hr />
					<div class="info-line">
						<div>Balance:</div>
						<div>{currentBalnceString} {symbol}</div>
					</div>
					<div class="info-line">
						<div>+ Reserve:</div>
						<div>{currentReserveString} {symbol}</div>
					</div>
				</div>

				{#if tokenAllowanceUsed}
					<div class="category">
						<span>Actions</span>
						<hr />
						{#if tokenAllowanceUsed}
							<button tabindex="0" class="error" on:click={() => clearAllowance()}>clear allowance</button>
						{/if}
					</div>
				{/if}
			{:else}
				<div class="disconnected">
					{#if $account.locked}
						<button class="primary" disabled={$account.unlocking} on:click={() => account.unlock()}>unlock</button>
					{:else}
						<button disabled={connecting} class="primary" on:click={() => connection.connect()}
							>{connecting ? 'Connecting' : 'Connect Your Wallet'}</button
						>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.category {
		width: 100%;
		margin-bottom: 3rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	.info-line {
		display: flex;
		width: 100%;
		justify-content: space-between;
	}
	.account {
		margin-bottom: 1rem;
	}
	.connected {
		width: 100%;
		display: flex;
		justify-content: space-between;
	}
	.disconnected {
		width: 100%;
		display: flex;
		justify-content: center;
	}

	hr {
		width: 100%;
		margin-bottom: 0.5rem;
		border: 1px solid var(--color-primary-500);
	}
	.menu-wrapper {
		pointer-events: auto;
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		width: 100%;
	}
	.menu {
		width: 100%;
		top: 2rem;
		pointer-events: auto;
		cursor: default;
		position: absolute;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: start;
		gap: 0.25rem;
		align-items: center;
		right: 0;
		list-style: none;
		padding: 16px;
		border-radius: 16px;

		background-color: var(--color-surface-800);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 fill;
		image-rendering: pixelated;
	}

	@media (min-width: 640px) {
		.menu {
			width: 300px;
			top: 0;
		}
	}

	.menu button {
		display: inline-block;
	}
</style>
