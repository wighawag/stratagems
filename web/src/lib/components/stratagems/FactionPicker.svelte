<script lang="ts">
	import {url} from '$lib/utils/path';
	import {account, accountData} from '$lib/web3';

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

<div class="fixed border top-48">
	<p class="text-slate-900">Your Color</p>
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<img class="w-20" style="image-rendering: pixelated;" src={url(src)} alt="color" on:click={swapColor} />
</div>
