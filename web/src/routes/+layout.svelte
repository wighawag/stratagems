<script lang="ts">
	import '../app.postcss';
	import NavTabs from '$lib/components/daisyui/NavTabs.svelte';
	import {dev, version} from '$app/environment';

	import {name, description, themeColor, canonicalURL, appleStatusBarStyle, ENSName} from 'web-config';
	import NewVersionNotification from '$lib/components/web/NewVersionNotification.svelte';
	import NoInstallPrompt from '$lib/components/web/NoInstallPrompt.svelte';
	import {url} from '$lib/utils/path';
	import Install from '$lib/components/web/Install.svelte';
	import ConnectButton from '$lib/web3/ConnectButton.svelte';
	import WipNotice from '$lib/components/utilities/WipNotice.svelte';
	import {initialContractsInfos, params} from '$lib/config';
	import EraseNotice from '$lib/components/utilities/EraseNotice.svelte';
	import ClaimTokenScreen from '$lib/components/claim/ClaimTokenScreen.svelte';
	import ComeBackLater from '$lib/components/utilities/ComeBackLater.svelte';

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
	<link rel="icon" href={url('/pwa/favicon.png')} type="image/svg+xml" />
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

<div class="relative top-0 z-50 navbar bg-base-100 h-16 p-1 border-b-2 border-primary">
	<div class="flex-1">
		<NavTabs
			pages={[
				{pathname: '/', title: 'Play'},
				{pathname: '/debug/', title: 'Debug'},
				{pathname: '/about/', title: 'About'},
			]}
		/>
	</div>
	<div class="flex-none">
		<ConnectButton />
	</div>
</div>

<!-- Disable native prompt from browsers -->
<NoInstallPrompt />
<!-- You can also add your own Install Prompt: -->
<!-- <Install src={url('/icon.svg')} alt="Stratagems" /> -->

<!-- Here is Notification for new version -->
<NewVersionNotification src={url('/icon.png')} alt="Stratagems" />

<slot />

<!-- use -my-20 to ensure the navbar is considered when using min-h-screen to offset the footer (when content is too small)-->
<!-- <div class="-my-20 flex flex-col min-h-screen justify-between"> -->
<!--div to revert -my-20-->
<!-- <div class="mt-20"> -->
<!-- <slot /> -->
<!-- </div> -->

<!-- </div> -->

<!-- We remove the notice when force is specified or if on base network -->
<!-- {#if !dev && !params['force'] && initialContractsInfos.chainId + '' !== '8453' && initialContractsInfos.name !== 'composablelabs'}
	<WipNotice />
{:else}
	<EraseNotice />
	<ClaimTokenScreen name="Stratagems" />
{/if} -->

<ComeBackLater />
