<script lang="ts">
	import {stratagemsView} from '$lib/state/ViewState';
	import WebGlCanvas from '$lib/render/WebGLCanvas.svelte';

	import Web3ConnectionUI from '$lib/blockchain/connection/Web3ConnectionUI.svelte';
	import ActionPanel from '$lib/actions/ActionPanel.svelte';
	import Epoch from '$lib/ui/components/Epoch.svelte';
	import Flow from '$lib/actions/flow/Flow.svelte';
	import FactionPicker from '$lib/actions/FactionPicker.svelte';
	import CameraInfo from '$utils/debug/CameraInfo.svelte';
	import Header from '$lib/ui/header/Header.svelte';
</script>

<div class="canvas">
	<WebGlCanvas state={stratagemsView} />
</div>

<div style="position: absolute; width: 100%; pointer-events: none;">
	<Header>
		<div class="epoch-info">
			<Epoch></Epoch>
		</div>
		<div class="faction-picker">
			<FactionPicker />
		</div>
	</Header>
</div>

<div class="camera-info">
	<CameraInfo />
</div>

<div class="action-panel">
	<ActionPanel />
</div>

<Flow />

<Web3ConnectionUI />

<style>
	.canvas {
		pointer-events: none;
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		width: 100%;
	}

	.camera-info {
		position: absolute;
		top: 50%;
		left: 0;
		width: 6rem;
		padding: 0.25rem;
		background-color: var(--color-surface-500);
	}

	.epoch-info {
		background-color: hsl(217 70% 20%); /*var(--color-surface-800);*/
		box-shadow:
			0 10px 15px -3px rgba(0, 0, 0, 0.1),
			0 4px 6px -2px rgba(0, 0, 0, 0.05);
		padding: 1rem;

		width: 100%;
	}

	.action-panel {
		margin: 0.5rem;
		width: 300px;
		max-width: 100%;
		position: absolute;
		bottom: 0;
		right: 0;

		background-color: var(--color-surface-500);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 repeat;
		image-rendering: pixelated;
	}

	.faction-picker {
		margin: 0.5rem;

		background-color: var(--color-surface-500);
		border: 16px solid var(--color-text-on-surface);
		border-image: url(/game-assets/ui/border.png) 16 repeat;
		image-rendering: pixelated;

		width: fit-content;
		padding: 0.25rem;
		width: fit-content;
	}
</style>
