<script lang="ts">
	import {viemClient} from '$lib/blockchain/connection';
	import {initialContractsInfos} from '$lib/config';
	import {stratagemsView} from '$lib/state/ViewState';
	import {formatUnits} from '$utils/ui/text';

	const decimals = Number(initialContractsInfos.contracts.Stratagems.linkedData.currency.decimals);
	$: total = $stratagemsView.tokensToCollect.reduce((p, c) => p + c.amount, 0n);

	async function claim() {
		await viemClient.execute(async ({client, network: {contracts}, account, connection}) => {
			const positions: bigint[] = $stratagemsView.tokensToCollect.map((v) => v.position);
			// TODO metadata + tracking
			const txHash = await client.wallet.writeContract({
				...contracts.Stratagems,
				functionName: 'pokeMultiple',
				args: [positions],
				account: account.address,
			});
		});
	}
</script>

{#if total > 0}
	<div class="panel">
		<h2 class="title">
			{formatUnits(total, decimals)}
			{initialContractsInfos.contracts.Stratagems.linkedData.currency.symbol} to claim
		</h2>

		<div class="actions">
			<button on:click={() => claim()}>claim</button>
		</div>
	</div>
{/if}

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;

		background-color: var(--color-surface-500);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 repeat;
		image-rendering: pixelated;
	}
	.actions {
		display: flex;
		justify-content: space-between;
	}
</style>
