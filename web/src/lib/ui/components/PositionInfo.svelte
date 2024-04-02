<script lang="ts">
	import {camera} from '$lib/render/camera';
	import {eventsView} from '../events/eventsView';
	import {menu} from '../menu/menu';

	export let x: number;
	export let y: number;

	function navigate() {
		console.log({x, y});
		camera.navigate(x + 0.5, y + 0.5, 180);
		eventsView.set({open: false});
		menu.set({open: false});
	}
</script>

<button on:click={() => navigate()}>{x},{y}</button>
