/**
 * THE PROCESSOR BUNDLE, SERVED STRAIGHT FROM THE INDEXER WHILE `vite dev` RUNS.
 *
 * The indexer worker fetches `processor.bundle.js` at the app's root, which a
 * build ships as `static/processor.bundle.js`, a COPY of
 * `../indexer/dist/processor.bundle.js` (`scripts/processor-bundle.js` says why
 * it is copied and never rebuilt: the tab must run the exact bytes a published
 * snapshot was folded with). In dev that copy used to be made once, when `dev`
 * started, while the indexer's own watch build (the INDEXER pane of
 * `pnpm start`, `tsup --watch` then `build:bundle`) writes the bundle whenever
 * the processor changes, including once at its own start. So the copy took
 * whatever `indexer/dist` held when the web pane got there first: on 2026-11-16
 * that was a bundle from before the cycle rename, the worker folded nothing the
 * current contracts emit, and the board said "Loading the board..." for good.
 *
 * So in dev nothing is copied: this answers the request itself, from
 * `indexer/dist`, byte for byte, ahead of the static files (a stale copy left in
 * `static/` is never served), and reloads the page when the indexer writes a new
 * bundle, so the worker starts on the new bytes (a new bundle is a new
 * processor, and the worker's database is keyed by it). A middleware on Vite's
 * own server, not a server of its own: same port, same origin.
 *
 * NOT A `?url` IMPORT, which would deliver it in a build as a hashed asset: in
 * dev Vite serves an imported `.js` through its transform pipeline, so the bytes
 * the worker hashes would be Vite's, equal to the bundle's only while nothing in
 * it is rewritten.
 *
 * Not under vitest, which serves nothing the worker fetches.
 */
import type {Plugin} from 'vite';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const BUNDLE = resolve(here, '../indexer/dist/processor.bundle.js');
const NAME = '/processor.bundle.js';

/** Whether a request is for the bundle, at the app's root under any base path. */
export function isBundleRequest(url: string | undefined): boolean {
	return url !== undefined && url.split('?')[0].endsWith(NAME);
}

/**
 * How long to wait after the indexer writes the bundle before reloading: a
 * write can arrive as several events, and a reload on the first could fetch a
 * file not finished yet.
 */
const SETTLE_MS = 150;

export function processorBundlePlugin(): Plugin | false {
	if (process.env['VITEST']) return false;
	return {
		name: 'stratagems-processor-bundle',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				if (!isBundleRequest(req.url) || !existsSync(BUNDLE)) return next();
				res.setHeader('Content-Type', 'text/javascript');
				res.setHeader('Cache-Control', 'no-store');
				res.end(readFileSync(BUNDLE));
			});

			server.watcher.add(BUNDLE);
			let timer: ReturnType<typeof setTimeout> | undefined;
			const onWrite = (path: string) => {
				if (resolve(path) !== BUNDLE) return;
				clearTimeout(timer);
				timer = setTimeout(() => {
					server.config.logger.info('processor bundle changed: reloading', {
						timestamp: true,
					});
					server.ws.send({type: 'full-reload'});
				}, SETTLE_MS);
			};
			server.watcher.on('add', onWrite);
			server.watcher.on('change', onWrite);
		},
	};
}
