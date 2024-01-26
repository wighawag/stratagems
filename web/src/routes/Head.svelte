<script lang="ts">
	import {dev, version} from '$app/environment';

	import {name, description, themeColor, canonicalURL, appleStatusBarStyle, ENSName} from 'web-config';
	import {url} from '$utils/path';

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
