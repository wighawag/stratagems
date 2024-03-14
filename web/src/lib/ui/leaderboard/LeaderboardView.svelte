<script lang="ts">
	import {Render, Subscribe, createRender, createTable} from 'svelte-headless-table';
	import {addSortBy} from 'svelte-headless-table/plugins';
	import {leaderboardView} from './leaderboardView';
	import {state} from '$lib/state/State';
	import ModalContainer from '$utils/ui/modals/ModalContainer.svelte';
	import {fly} from 'svelte/transition';
	import {derived} from 'svelte/store';
	import type {Readable} from 'svelte/store';
	import type {GlobalRate, SharedRatePerAccount} from 'stratagems-indexer';
	import LeaderboardRow from './LeaderboardRow.svelte';
	import {every3Seconds, time} from '$lib/blockchain/time';
	import {formatEther} from 'viem';

	const PRECISION = BigInt(1e24);
	const DECIMALS_18_MILLIONTH = 1000000000000n;
	const REWARD_RATE_millionth = 100n;

	function _computeExtraTotalRewardPerPointSinceLastTime(
		timestamp: bigint,
		totalPoints: bigint,
		rewardRateMillionth: bigint,
		lastUpdateTime: bigint,
	) {
		if (totalPoints == 0n) {
			return 0n;
		}
		return ((timestamp - lastUpdateTime) * rewardRateMillionth * PRECISION) / totalPoints;
	}

	function _computeRewardsEarned(
		totalRewardPerPointAccountedSoFar: bigint,
		accountPoints: bigint,
		currentTotalRewardPerPoint: bigint,
		accountRewardsSoFar: bigint,
	) {
		return (
			accountRewardsSoFar +
			(accountPoints * (currentTotalRewardPerPoint - totalRewardPerPointAccountedSoFar) * DECIMALS_18_MILLIONTH) /
				PRECISION
		);
	}

	function computeReward(timestamp: bigint, global: GlobalRate, sharedRatePerAccount: SharedRatePerAccount) {
		return _computeRewardsEarned(
			sharedRatePerAccount.totalRewardPerPointAccounted,
			sharedRatePerAccount.points,
			global.totalRewardPerPointAtLastUpdate +
				_computeExtraTotalRewardPerPointSinceLastTime(
					timestamp,
					global.totalPoints,
					REWARD_RATE_millionth,
					BigInt(global.lastUpdateTime),
				),
			sharedRatePerAccount.rewardsToWithdraw,
		);
	}
	const list: Readable<
		{
			player: `0x${string}`;
			pointsInfo: {
				points: number;
				gems: string;
			};
		}[]
	> = derived([state, every3Seconds], ([$state, $time]) =>
		Object.keys($state.points.shared)
			.map((k) => {
				const pointsInfo = $state.points.shared[k as `0x${string}`] as SharedRatePerAccount;
				return {
					player: k as `0x${string}`,
					pointsInfo,
					gems: computeReward(BigInt($time.blockchainTimestamp), $state.points.global, pointsInfo),
				};
			})
			.sort((a, b) =>
				a.gems > b.gems
					? -1
					: a.gems < b.gems
						? 1
						: a.pointsInfo.points > b.pointsInfo.points
							? -1
							: a.pointsInfo.points < b.pointsInfo.points
								? 1
								: 0,
			)
			.map((v) => ({
				player: v.player,
				pointsInfo: {
					points: Number(v.pointsInfo.points / 1000000000000000000n),
					gems: formatEther(v.gems),
				},
			})),
	);

	//  Object.keys(playersDict).map((k) => playersDict[k]);

	const table = createTable(list, {
		sort: addSortBy(),
	});
	const columns = table.createColumns([
		table.column({
			header: 'player',
			accessor: (commitment) => commitment,
			cell: ({value}) =>
				createRender(LeaderboardRow, {
					player: value.player,
					pointsInfo: value.pointsInfo,
				}),
		}),
	]);

	const {headerRows, rows, tableAttrs, tableBodyAttrs} = table.createViewModel(columns);
</script>

{#if $leaderboardView.open}
	<ModalContainer oncancel={() => ($leaderboardView.open = false)}>
		<div class="container" transition:fly={{x: '100%'}}>
			<table {...$tableAttrs}>
				<thead>
					{#each $headerRows as headerRow (headerRow.id)}
						<Subscribe rowAttrs={headerRow.attrs()} let:rowAttrs>
							<tr {...rowAttrs}>
								{#each headerRow.cells as cell (cell.id)}
									<Subscribe attrs={cell.attrs()} let:attrs>
										<th {...attrs}>
											<Render of={cell.render()} />
										</th>
									</Subscribe>
								{/each}
							</tr>
						</Subscribe>
					{/each}
				</thead>
				<tbody {...$tableBodyAttrs}>
					{#each $rows as row (row.id)}
						<Subscribe rowAttrs={row.attrs()} let:rowAttrs>
							<tr {...rowAttrs}>
								{#each row.cells as cell (cell.id)}
									<Subscribe attrs={cell.attrs()} let:attrs>
										<td {...attrs}>
											<Render of={cell.render()} />
										</td>
									</Subscribe>
								{/each}
								<!-- {#if row.original.type}
                                <td><button on:click={() => showDetails(row)}>Details</button></td>
                            {/if} -->
							</tr>
						</Subscribe>
					{/each}
				</tbody>
			</table>
		</div>
	</ModalContainer>
{/if}

<style>
	table {
		width: 100%;
	}
	th {
		text-align: start;
	}
	.container {
		width: 100%;
		top: 2rem;
		right: 0;
		height: calc(100% - 2rem);
		overflow: auto;

		pointer-events: auto;
		cursor: default;
		position: absolute;

		display: flex;
		flex-direction: column;
		justify-content: start;
		gap: 0.25rem;

		padding: 16px;
		border-radius: 16px;

		background-color: var(--color-surface-800);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 fill;
		image-rendering: pixelated;
	}
</style>
