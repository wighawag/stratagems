<script lang="ts">
	import CopyBlock from '$lib/components/utilities/CopyBlock.svelte';

	import {name} from 'web-config';
</script>

<section class="py-2 px-4 text-center">
	<div class="max-w-auto md:max-w-lg mx-auto">
		<p class="!text-2xl flex justify-center space-x-2 font-black my-8">
			{name} is a permission-less and persistent board game where a set of colors compete for the control of the board.
		</p>
	</div>

	<div class="pt-3 pb-4">
		<p class="mt-6 text-base-300">
			Find out more on
			<a class="underline" href="https://github.com/wighawag/stratagems#readme" target="_blank" rel="noreferrer"
				>github</a
			>
		</p>
	</div>
</section>
