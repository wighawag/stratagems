<script>
	import CanvasOverlay from '../canvas/CanvasOverlay.svelte';
	import {landmenu} from '$lib/ui/landmenu/landmenu';
</script>

{#if $landmenu.cell}
	<CanvasOverlay x={$landmenu.cell.x} y={$landmenu.cell.y}
		><div style="width: 300px; height: 200px;background-color:red;"></div></CanvasOverlay
	>
{/if}
