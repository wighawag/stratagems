<script lang="ts">
	let welcome = true;
	function connect() {
		welcome = false;
	}
</script>

<dialog open={welcome}>
	<article>
		<header>Welcome to Tiny Roger</header>

		<p>You need a Wallet to Play or Watch.</p>
		<footer>
			<a href="#connect" on:click={connect} role="button">Connnect</a>
		</footer>
	</article>
</dialog>
