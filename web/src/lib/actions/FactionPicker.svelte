<script lang="ts">
	import {url} from '$utils/path';
	import {account, accountData} from '$lib/blockchain/connection';
	import {getFactionIcon} from './utils/faction-icons';
	import {getCurrentColor} from './utils/current-color';

	$: offchainState = accountData.offchainState;

	$: color = getCurrentColor($offchainState, $account.address);

	$: src = getFactionIcon(color);

	function swapColor() {
		accountData.swapCurrentColor();
	}
</script>

{#if $account.state === 'Connected'}
	<div class="container">
		<div class="content" id="faction-picker">
			<p class="title">Your Color</p>
			<p class="help">(click to swap)</p>
			<button on:click={swapColor}><img src={url(src)} alt="color" /></button>
		</div>
	</div>
{/if}

<style>
	.title {
		display: none;
	}
	.help {
		display: none;
		font-size: small;
	}
	.container {
		background-color: var(--color-surface-500);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 repeat;
		image-rendering: pixelated;
	}
	.content {
		margin: -16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}
	img {
		width: 3rem;
		pointer-events: auto;
		image-rendering: pixelated;
	}

	button {
		background-color: inherit;
	}

	@media (min-width: 640px) {
		.title,
		.help {
			display: block;
		}
		.content {
			margin: 0;
		}
		img {
			width: 5rem;
		}
	}
</style>
