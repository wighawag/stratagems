<script lang="ts">
	import '../app.css';
	import {dev, version} from '$app/environment';

	import {name, description, themeColor, canonicalURL, appleStatusBarStyle, ENSName} from 'web-config';
	import NewVersionNotification from '$lib/components/web/NewVersionNotification.svelte';
	import NoInstallPrompt from '$lib/components/web/NoInstallPrompt.svelte';
	import {url} from '$lib/utils/path';
	import {initialContractsInfos, params} from '$lib/config';
	import Header from '$lib/structure/Header.svelte';
	import EraseNotice from '$lib/components/utilities/EraseNotice.svelte';
	import ClaimTokenScreen from '$lib/components/claim/ClaimTokenScreen.svelte';
	import WipNotice from '$lib/components/utilities/WipNotice.svelte';

	const host = canonicalURL.endsWith('/') ? canonicalURL : canonicalURL + '/';
	const previewImage = host + 'preview.png';
</script>

<svelte:head>
	<title>{name}</title>
	<meta name="title" content={name} />
	<meta name="description" content={description} />
	{#if ENSName}<meta name="Dwebsite" content={ENSName} />
	{/if}

	<meta property="og:type" content="website" />
	<meta property="og:url" content={host} />
	<meta property="og:title" content={name} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={previewImage} />
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:url" content={host} />
	<meta property="twitter:title" content={name} />
	<meta property="twitter:description" content={description} />
	<meta property="twitter:image" content={previewImage} />

	<!-- minimal -->
	<!-- use SVG, if need PNG, adapt accordingly -->
	<!-- TODO automatise -->
	<link rel="icon" href={url('/pwa/favicon.png')} type="image/png" />
	<link rel="icon" href={url('/pwa/favicon.ico')} sizes="any" /><!-- 32×32 -->
	<link rel="apple-touch-icon" href={url('/pwa/apple-touch-icon.png')} /><!-- 180×180 -->
	<link rel="manifest" href={url('/pwa/manifest.webmanifest')} />

	<!-- extra info -->
	<meta name="theme-color" content={themeColor} />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="application-name" content={name} />

	<!-- apple -->
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content={appleStatusBarStyle} />
	<meta name="apple-mobile-web-app-title" content={name} />

	<meta name="version" content={version} />

	{#if !dev}
		<script>
			(function () {
				let params = new URLSearchParams(window.location.search);
				const eruda_options = params.get('_d_eruda');
				if (eruda_options !== '' && !eruda_options && localStorage.getItem('active-eruda') != 'true') return;
				const _ = '';
				let add_plugins = '';
				let load_plugins = '';
				if (eruda_options.length > 0) {
					for (const plugin of eruda_options.split(',')) {
						let [package, v] = plugin.split(':');
						v =
							v ||
							package
								.split('-')
								.map((split, i) => (i > 0 ? split[0].toUpperCase() + split.slice(1) : split))
								.join('');
						load_plugins += `document.write(\`<scr\${_}ipt src="//cdn.jsdelivr.net/npm/${package}"></scr\${_}ipt>\`);`;
						add_plugins += `eruda.add(${v});`;
					}
				}

				document.write(`
					<scr${_}ipt>
						const _ = '';
						if (typeof eruda === "undefined") {
							document.write(\`<scr\${_}ipt src="//cdn.jsdelivr.net/npm/eruda"></scr\${_}ipt>\`);
						};
						${load_plugins}
						document.write(\`<scr\${_}ipt>eruda.init();${add_plugins}</scr\${_}ipt>\`);
					</scr${_}ipt>
				`);
			})();
		</script>

		<script>
			const version = document.querySelector('meta[name="version"]').content;
			window.SENTRY_RELEASE = {
				id: version,
			};
		</script>
		<script src={url('/sentry.js')} crossorigin="anonymous"></script>
		<script>
			if (typeof Sentry !== 'undefined') {
				Sentry.onLoad(function () {
					Sentry.init({
						tunnel: 'https://sentry-tunnel.rim.workers.dev/tunnel',
					});
				});
			}
		</script>
	{/if}
</svelte:head>

<div class="page">
	<Header />

	<slot />
</div>

<!-- We remove the notice when force is specified or if on base network -->
{#if !dev && !params['force'] && initialContractsInfos.chainId + '' !== '8453'}
	<WipNotice />
{:else}
	<EraseNotice />
	<ClaimTokenScreen name="Stratagems" />
{/if}

<!-- Disable native prompt from browsers -->
<NoInstallPrompt />
<!-- You can also add your own Install Prompt: -->
<!-- <Install src={url('/icon.svg')} alt="Stratagems" /> -->

<!-- Here is Notification for new version -->
<NewVersionNotification src={url('/icon.png')} alt="Stratagems" />

<style>
	/* We wrap our app in this div */
	/* So we can move the footer to the bottom (see margin-top:auto) */
	/* This use flex flex-direction column to put each element vertically 
		And use min-height to ensure all speace is taken */
	/* This assumes html, body and any other anecsotr of .wrapper have height:100% */
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100%;
	}

	/* This target the inner Footer element thanks to rootClass */
	/* Svelte has no way to parametrize non-global class due to its strong encapsulation
	/* But with css we often need to alter child position from parents */
	.page :global(.footer) {
		margin-top: auto;
	}
</style>
