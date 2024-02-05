<script lang="ts">
	import {typewrite} from './typewriter';
</script>

<p use:typewrite><slot /></p>

<style>
	p:not(.stopped) {
		&:after {
			content: '|';
			animation: blink 500ms linear infinite alternate;
		}
	}
</style>
