<script lang="ts">
	import {account, connection, contracts, network} from '$lib/blockchain/connection';
	import {menu} from './menu';
	import {transactionsView} from '$lib/ui/transactions/transactionsView';
	import {commitmentsView} from '$lib/ui/commitments/commitmentsView';
	import {indexerView} from '$lib/ui/indexer/indexerView';
	import {viewStateView} from '$lib/ui/viewstate/viewStateView';
	import {admin} from '$lib/ui/admin/admin';
	import {fly} from 'svelte/transition';
	import {HelpCircle, Power} from 'lucide-svelte';
	import ImgBlockie from '$utils/ethereum/ImgBlockie.svelte';
	import {balance} from '$lib/state/balance';
	import {formatUnits} from '$utils/ui/text';
	import {contractsInfos, initialContractsInfos} from '$lib/config';
	import {tooltip} from '$utils/ui/tooltip';
	import ModalContainer from '$utils/ui/modals/ModalContainer.svelte';

	import {startTour} from '$lib/ui/tour/drive';

	$: tokenAllowanceUsed = $balance.tokenAllowance > 0n;

	$: isAdmin = $account.address?.toLowerCase() === $contractsInfos.contracts.Stratagems.linkedData.admin?.toLowerCase();

	const symbol = initialContractsInfos.contracts.Stratagems.linkedData.currency.symbol;
	const name = initialContractsInfos.contracts.Stratagems.linkedData.currency.name;
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

	$: allowance = $balance.tokenAllowance;
	$: allowanceString =
		allowance == 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn
			? 'Infinite'
			: formatUnits(
					allowance,
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

	$: connecting =
		$connection.connecting || $account.fetching || $network.loading || $account.isLoadingData != undefined;

	function computeShortAddress(address: string): string {
		return address.slice(0, 6) + '...' + address.slice(-4);
	}
</script>

{#if $menu.open}
	<ModalContainer oncancel={() => ($menu.open = false)}>
		<div class="menu" transition:fly={{x: '100%'}}>
			{#if $account.state === 'Connected' && !$account.locked}
				<div class="connected">
					<ImgBlockie address={$account.address} style="object-fit: cover;height: 2rem;width: 2rem;display: inline;" />
					<span class="address">{computeShortAddress($account.address)}</span>
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
					<div>{name}</div>
					<hr />
					{#if $balance.state === 'Idle' && $balance.fetching}
						<div class="info-line">Fetching Balance...</div>
					{:else}
						<div class="info-line">
							<div>Balance:</div>
							<div>{currentBalnceString} {symbol}</div>
						</div>
						<div class="info-line">
							<div>
								+ Reserve <span
									use:tooltip
									title="Token in Reserve are used to ensure players reveal their moves. You can remove them from reserve after you reveal your commit or cancel it before the reveal phase."
									><HelpCircle /></span
								> :
							</div>
							<div>{currentReserveString} {symbol}</div>
						</div>
						<div class="info-line allowance">
							<div>
								&nbsp;&nbsp; Allowance <span
									use:tooltip
									title="Allowance is used so you do not need to keep being asked to allow the game contract to use your token when creating new island."
									><HelpCircle /></span
								>
							</div>
							<div>{allowanceString}</div>
						</div>
					{/if}
				</div>

				<div class="category">
					<hr />
					{#if tokenAllowanceUsed}
						<button class="error" on:click={() => clearAllowance()}>Clear Allowance</button>
					{/if}

					<button class="error" on:click={() => ($transactionsView.open = true)}>See Transactions</button>

					<button class="error" on:click={() => ($commitmentsView.open = true)}>See Commitments</button>

					<button class="error" on:click={() => ($indexerView.open = true)}>See Indexer State</button>

					<button class="error" on:click={() => ($viewStateView.open = true)}>See View State</button>

					{#if isAdmin}
						<button class="error" on:click={() => ($admin.open = true)}>Admin</button>
					{/if}

					<button
						class="error"
						on:click={() => {
							$menu.open = false;
							startTour();
						}}>Start Tour</button
					>
				</div>
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
	</ModalContainer>
{/if}

<style>
	.allowance {
		color: var(--color-primary-600);
	}
	.category {
		width: 100%;
		margin-bottom: 3rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	.category button {
		width: 100%;
	}
	.info-line {
		display: flex;
		width: 100%;
		justify-content: space-between;
	}
	.connected {
		width: 100%;
		display: flex;
		margin-bottom: 1rem;
		gap: 0.5rem;
		align-items: center;
	}
	.address {
		max-width: calc(100% - 0px);
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
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

	.icon {
		margin-left: auto;
	}
	.icon :global(.lucide) {
		min-height: 1.5rem;
		min-width: 1.5rem;
	}
</style>
