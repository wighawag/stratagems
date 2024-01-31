<script lang="ts">
	import {account, connection, contracts} from '$lib/blockchain/connection';
	import {initialContractsInfos} from '$lib/config';
	import {zeroAddress} from 'viem';
	import {menu} from './menu';
	import {fly} from 'svelte/transition';

	let tokenAllowanceUsed = (initialContractsInfos.contracts.Stratagems.linkedData.tokens as string) !== zeroAddress;

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
</script>

{#if $menu.open}
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<div class="menu-wrapper" on:click={clickOutside}>
		<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
		<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
		<ul id="menu" tabindex="0" class="menu" transition:fly={{x: '100%'}} on:click={prevent}>
			<li>
				{#if $account.state === 'Disconnected' || $account.locked}
					{#if $account.locked}
						<button class="primary" disabled={$account.unlocking} on:click={() => account.unlock()}>unlock</button>
					{:else}
						<button
							disabled={$connection.connecting}
							class={`${$connection.initialised ? '' : 'invisible'} primary`}
							on:click={() => connection.connect()}>{$connection.connecting ? 'Connecting' : 'Connect'}</button
						>
					{/if}
				{:else}
					<button class="error" on:click={() => disconnect()}>disconnect</button>
				{/if}
			</li>

			{#if tokenAllowanceUsed}
				<li>
					<button tabindex="0" class="error" on:click={() => clearAllowance()}>clear allowance</button>
				</li>
			{/if}
		</ul>
	</div>
{/if}

<style>
	.menu-wrapper {
		pointer-events: auto;
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		width: 100%;
	}
	.menu {
		pointer-events: auto;
		cursor: default;
		position: absolute;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.25rem;
		align-items: center;
		right: 0;
		list-style: none;
		padding: 16px;
		border-radius: 16px;
		box-shadow:
			4px 6px 3px 0 rgb a(1, 0, 0, 0.1),
			4px 6px 2px 0 rgba(0, 0, 0, 0.06);

		background-color: var(--color-surface-800);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 fill;
		image-rendering: pixelated;
	}

	.menu button {
		display: inline-block;
	}
</style>
