<script lang="ts">
	import {router, Route as R} from 'tinro';
	// this is to remove type issue (See: https://github.com/AlexxNB/tinro/issues/117)
	const Route = R as unknown as ConstructorOfATypedSvelteComponent;

	const base = (window as any).BASE;
	if (base) {
		router.base(base);
		router.mode.history();
	}

	import Home from './pages/Home.svelte';
	import Info from './pages/Info.svelte';
</script>

<Route path="/"><Home /></Route>
<Route path="/info">
	<Info />
</Route>
