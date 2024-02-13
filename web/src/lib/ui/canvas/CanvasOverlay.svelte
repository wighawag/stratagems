<script lang="ts">
	import {dev} from '$lib/config';
	import {camera} from '$lib/render/camera';
	import {stratagemsView} from '$lib/state/ViewState';
	import {JsonView} from '@zerodevx/svelte-json-view';
	import {xyToXYID} from 'stratagems-common';

	import {portal} from 'svelte-portal';

	$: pointer = $camera ? {x: $camera.pointerX, y: $camera.pointerY} : {x: 0, y: 0};
	$: screenPos = camera.worldToScreen(pointer.x, pointer.y);

	$: pos = {x: screenPos.x + 10, y: screenPos.y + 10};

	$: cell = $stratagemsView.cells[xyToXYID(Math.floor(pointer.x), Math.floor(pointer.y))];
	$: viewCell = $stratagemsView.viewCells[xyToXYID(Math.floor(pointer.x), Math.floor(pointer.y))];

	stratagemsView;
</script>

{#if dev && $camera && cell}
	<div class="cell-info" use:portal={'#canvas-overlay'} hidden style={`transform: translate(${pos.x}px, ${pos.y}px);`}>
		Land {Math.floor(pointer.x)},{Math.floor(pointer.y)}
		<p>
			<JsonView json={cell} depth={1} />
		</p>
		<p>
			<JsonView json={viewCell} depth={1} />
		</p>
	</div>
{/if}

<style>
	.cell-info {
		pointer-events: none;
		position: absolute;
		top: 0;
		left: 0;
		width: 16rem;
		padding: 0.25rem;
		background-color: var(--color-surface-500);
	}
</style>
