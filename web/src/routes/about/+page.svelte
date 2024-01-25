<script lang="ts">
	import CopyBlock from '$lib/components/utilities/CopyBlock.svelte';

	import {name} from 'web-config';
</script>

<section>
	<div class="introduction">
		<p class="first feature">
			Stratagems is an independent universe forever running where players strategicaly place colors on an infinite grid
			using ETH with the hope to collect more of it from the other players. Alliances and betrayal are part of the
			arsenal as the colors mix and shift.
		</p>
	</div>

	<div class="actions">
		<h1 class="use-it">Use it:</h1>
		<CopyBlock text={`npx degit wighawag/jolly-roger your-app-folder`} />
		<p class="more-info">
			Find out more on
			<a href="https://stratagems.world" target="_blank" rel="noreferrer">our website</a> or on
			<a href="https://github.com/wighawag/stratagems#readme" target="_blank" rel="noreferrer">github</a>
		</p>
	</div>
</section>

<style>
	section {
		padding-top: 0.5rem;
		padding-bottom: 0.5rem;
		padding-left: 1rem;
		padding-right: 1rem;
		text-align: center;
	}

	.introduction {
		max-width: fit-content;
		margin-inline: auto;
	}

	@media (min-width: 768px) {
		.introduction {
			max-width: 32rem;
		}
	}

	.feature {
		display: flex;
		margin-top: 2rem;
		margin-bottom: 2rem;
		margin-left: 0.5rem;
		justify-content: center;
		font-size: 1.25rem;
		line-height: 1.75rem;
	}

	.first {
		margin-top: 2rem;
		margin-bottom: 2rem;
		font-weight: 900;
	}

	.actions {
		padding-top: 0.75rem;
		padding-bottom: 1rem;
	}

	.use-it {
		margin: 1rem;
		font-weight: 600;
	}

	.more-info {
		margin-top: 1.5rem;
	}
</style>
