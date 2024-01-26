<script lang="ts">
	import {FUZD_URI, blockchainExplorer} from '$lib/config';
	import {accountData} from '$lib/blockchain/connection';
	const onchainActions = accountData.onchainActions;

	$: onChainActionList = Object.keys($onchainActions)
		.filter((k) => $onchainActions[k as `0x${string}`].tx.metadata?.type === 'commit')
		.map((k) => ({
			hash: k as `0x${string}`,
			action: $onchainActions[k as `0x${string}`],
		}));

	function shortHash(hash: `0x${string}`) {
		return hash.slice(0, 8) + '...';
	}
</script>

<!-- TODO tailwind replacement -->

<div class="overflow-x-auto">
	<table class="table">
		<!-- head -->
		<thead>
			<tr>
				<th>
					<label>
						<input type="checkbox" class="checkbox" />
					</label>
				</th>
				<th>Hash</th>
				<th>Epoch</th>
				<th>Reveal</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each onChainActionList as onchainAction}
				<!-- <li></li>{transaction.hash}: {transaction.transaction.inclusion}</li> -->
				<tr>
					<th>
						<label>
							<input type="checkbox" class="checkbox" />
						</label>
					</th>
					<td>
						<div class="flex items-center space-x-3">
							<!-- <div class="avatar">
								<div class="mask mask-squircle w-12 h-12">
									<img src="/tailwind-css-component-profile-2@56w.png" alt="Avatar Tailwind CSS Component" />
								</div>
							</div> -->
							<div>
								{#if onchainAction.action.inclusion === 'Included'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="w-6 h-6"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								{:else if onchainAction.action.inclusion === 'NotFound'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="w-6 h-6"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
										/>
									</svg>
								{:else if onchainAction.action.inclusion === 'Cancelled'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="w-6 h-6"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								{:else if onchainAction.action.inclusion === 'BeingFetched'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="w-6 h-6"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M15.75 15.75l-2.489-2.489m0 0a3.375 3.375 0 10-4.773-4.773 3.375 3.375 0 004.774 4.774zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								{:else if onchainAction.action.inclusion === 'Broadcasted'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class="w-6 h-6"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								{/if}
							</div>
							<div>
								<div class="font-bold">
									<a
										class="underline"
										href={`${blockchainExplorer}/tx/${onchainAction.hash}`}
										target="_blank"
										rel="noreferer noopener">{shortHash(onchainAction.hash)}</a
									>
								</div>
								<div class="text-sm opacity-50">{onchainAction.action.inclusion}</div>
							</div>
						</div>
					</td>
					<td>
						{onchainAction.action.tx.metadata?.epoch}
					</td>
					<td>
						{#if onchainAction.action.revealTx}
							<div class="font-bold">
								Manual
								<a
									class="underline"
									href={`${blockchainExplorer}/tx/${onchainAction.action.revealTx.hash}`}
									target="_blank"
									rel="noreferer noopener">{shortHash(onchainAction.action.revealTx.hash)}</a
								>
							</div>
							<div class="text-sm opacity-50">{onchainAction.action.revealTx.inclusion}</div>
						{:else if onchainAction.action.tx.metadata?.type === 'commit' && onchainAction.action.tx.metadata.fuzd}
							{#if onchainAction.action.fuzd}
								{#if onchainAction.action.fuzd.state === 'replaced'}
									Replaced
								{:else if onchainAction.action.fuzd.state}
									<div class="font-bold">
										FUZD
										<a
											class="underline"
											href={`${FUZD_URI}/queuedExecution/${onchainAction.action.fuzd.state.chainId}/${onchainAction.action.fuzd.state.account}/${onchainAction.action.fuzd.state.slot}`}
											target="_blank"
											rel="noreferer noopener">{`will reveal on ${onchainAction.action.fuzd.state.checkinTime}`}</a
										>
									</div>
									<div class="text-sm opacity-50">...</div>
								{:else}
									Error
								{/if}
							{:else}
								Waiting for tx...
							{/if}
						{:else}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="w-6 h-6"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M15.75 15.75l-2.489-2.489m0 0a3.375 3.375 0 10-4.773-4.773 3.375 3.375 0 004.774 4.774zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
						{/if}
					</td>
					<th>
						<button class="btn btn-ghost btn-xs">details</button>
					</th>
				</tr>
			{/each}
		</tbody>
		<!-- foot -->
		<!-- <tfoot>
			<tr>
				<th></th>
				<th>Name</th>
				<th>Job</th>
				<th>Favorite Color</th>
				<th></th>
			</tr>
		</tfoot> -->
	</table>
</div>
