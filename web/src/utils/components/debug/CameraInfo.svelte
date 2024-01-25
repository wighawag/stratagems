<script lang="ts">
	import {camera} from '$lib/render/camera';
</script>

{#if $camera}
	<div class="alert alert-warning absolute">
		World Pointer {$camera.pointerX}, {$camera.pointerY}
	</div>
{/if}
