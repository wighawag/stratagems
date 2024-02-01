<script lang="ts">
	import {stratagemsView} from '$lib/state/ViewState';
	import WebGlCanvas from '$lib/render/WebGLCanvas.svelte';
	import ActionPanel from '$lib/actions/ActionPanel.svelte';
	import InfoBar from '$lib/ui/components/InfoBar.svelte';
	import FactionPicker from '$lib/actions/FactionPicker.svelte';
	import CanvasOverlay from '$lib/ui/canvas/CanvasOverlay.svelte';
	import Header from '$lib/ui/header/Header.svelte';
</script>

<div style="position: absolute; z-index: 1; width: 100%; height: 100%; pointer-events: none;">
	<Header>
		<div class="info-bar">
			<InfoBar></InfoBar>
		</div>
		<div class="faction-picker">
			<FactionPicker />
		</div>
	</Header>
	<CanvasOverlay />

	<div class="action-panel">
		<ActionPanel />
	</div>
</div>

<div class="canvas">
	<WebGlCanvas state={stratagemsView} />
</div>

<style>
	.canvas {
		pointer-events: none;
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		width: 100%;
	}

	.info-bar {
		pointer-events: auto;
		background-color: hsl(217 70% 20%); /*var(--color-surface-800);*/
		box-shadow:
			0 10px 15px -3px rgba(0, 0, 0, 0.1),
			0 4px 6px -2px rgba(0, 0, 0, 0.05);
		padding: 1rem;

		width: 100%;
	}

	.action-panel {
		pointer-events: auto;
		margin: 0.5rem;
		width: 300px;
		max-width: 100%;
		position: absolute;
		bottom: 0;
		right: 0;
	}

	.faction-picker {
		pointer-events: auto;
		margin: 0.5rem;

		width: fit-content;
	}
</style>
