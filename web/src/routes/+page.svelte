<script lang="ts">
	import {stratagemsView} from '$lib/state/ViewState';
	import WebGlCanvas from '$lib/render/WebGLCanvas.svelte';
	import GameUI from '$lib/ui/GameUI.svelte';
</script>

<div class="fullscreen">
	<WebGlCanvas state={stratagemsView} />
</div>

<div class="fullscreen">
	<GameUI />
</div>

<style>
	.fullscreen {
		pointer-events: none;
		position: absolute;
		top: 0;
		left: 0;
		height: 100%;
		width: 100%;
	}
</style>
