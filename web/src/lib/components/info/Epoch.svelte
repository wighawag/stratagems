<script lang="ts">
	import {epoch, epochInfo} from '$lib/blockchain/state/Epoch';
	import {time} from '$lib/time';
	import {timeToText} from '$lib/utils/time';
</script>

{#if !$time.synced}
	<div class="alert alert-warning absolute">
		<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"
			><path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/></svg
		>
		<p>Syncing ...</p>
	</div>
{:else if $epochInfo.timeLeftToReveal > 0}
	<div class="alert alert-warning absolute">
		<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"
			><path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
			/></svg
		>
		<p>
			Please wait while everyone resolve their moves... <svg
				class="stroke-current shrink-0 h-6 w-6 inline"
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
		</p>
		<p>{timeToText($epochInfo.timeLeftToReveal)} left</p>
	</div>
{/if}

<!-- <label for="epoch">Epoch</label>
<p id="epoch">{$epoch}</p>

<label for="epochInfo">epochInfo</label>
<p id="epochInfo">{$epochInfo.timeLeftToCommit}</p> -->
