<script lang="ts">
	import {camera} from '$lib/render/camera';
</script>

{#if $camera}
	<div class="alert alert-warning absolute">
		World {Math.floor($camera.pointerX)},{Math.floor($camera.pointerY)}
	</div>
{/if}
