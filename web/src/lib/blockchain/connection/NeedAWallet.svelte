<script lang="ts">
	import Modal from '$utils/ui/modals/Modal.svelte';
	import {url} from '$utils/path';
	import {connection} from './';
</script>

<Modal
	oncancel={() => {
		connection.acknowledgeError();
		connection.cancel();
	}}
>
	<div class="title">You need a web3 wallet to continue</div>
	<p class="description">
		If you are on mobile, please navigate to the game from inside their integrated browser. Note that mobile experience
		is not optimal for now.
	</p>
	<div class="download">
		<a href="https://metamask.io/download.html" role="button" class="primary">
			<img alt={`Download Metamask}`} src={url('/images/wallets/metamask.svg')} />
			Download metamask
		</a>
	</div>
</Modal>

<style>
	.title {
		text-align: center;
	}

	.download {
		display: flex;
		justify-content: center;
	}

	.download a {
		margin: 1rem;
		width: max-content;
		height: 3rem;
	}
	.download img {
		object-fit: contain;
		padding: 0;
		margin-left: 0.5rem;
		margin-right: 0.5rem;
		width: 2.5rem;
		height: 2.5rem;
		cursor: pointer;
	}
	p {
		margin-block: 1rem;
	}
</style>
