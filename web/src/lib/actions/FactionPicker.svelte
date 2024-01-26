<script lang="ts">
	import {url} from '$utils/path';
	import {account, accountData} from '$lib/blockchain/connection';

	$: offchainState = accountData.offchainState;

	$: color = $offchainState.currentColor || Number($account.address ? (BigInt($account.address) % 5n) + 1n : 1n);

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

<div>
	<p>Your Color</p>
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<img style="image-rendering: pixelated;" src={url(src)} alt="color" on:click={swapColor} />
</div>

<style>
	img {
		pointer-events: auto;
	}
</style>
