<script lang="ts">
	import {url} from '$utils/path';
	import {account, accountData} from '$lib/blockchain/connection';

	$: offchainState = accountData.offchainState;

	$: color = $offchainState.currentColor.color || Number($account.address ? (BigInt($account.address) % 5n) + 1n : 1n);

	let src = '/game-assets/blue.png';
	$: {
		switch (color) {
			case 1:
				src = '/game-assets/blue.png';
				break;
			case 2:
				src = '/game-assets/red.png';
				break;
			case 3:
				src = '/game-assets/green.png';
				break;
			case 4:
				src = '/game-assets/yellow.png';
				break;
			case 5:
				src = '/game-assets/purple.png';
				break;
		}
	}

	function swapColor() {
		accountData.swapCurrentColor();
	}
</script>

<div class="container">
	<div class="content" id="faction-picker">
		<p class="title">Your Color</p>
		<p class="help">(click to swap)</p>
		<button on:click={swapColor}><img src={url(src)} alt="color" /></button>
	</div>
</div>

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
