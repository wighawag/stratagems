/// <reference types="@sveltejs/kit" />
import {build, version, prerendered, files} from '$service-worker';
import {createFetchAndUpdateCache} from './service-worker/fetch-and-update-cache';
// ------------------- CONFIG ---------------------------
const DEV = true;
const OFFLINE_CACHE = 'all';
// ------------------------------------------------------

let urlsToPreCache: string[] = [];
if (OFFLINE_CACHE === 'all') {
	urlsToPreCache = build.concat(prerendered).concat(files.filter((v) => v.indexOf('pwa/') === -1));
} // TODO support more offline option

let _logEnabled = true; // TODO false
function log(...args: any[]) {
	if (_logEnabled) {
		console.debug(...args);
	}
}

const CACHE_NAME = 'cache-name-2' + version;

self.addEventListener('message', function (event) {
	if (event.data && event.data.type === 'debug') {
		_logEnabled = event.data.enabled && event.data.level >= 5;
	} else if (event.data === 'skipWaiting') {
		log(`skipWaiting received`);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(self as any).skipWaiting();
	}
});

const regexesOnlineFirst: string[] = [];
if (DEV) {
	regexesOnlineFirst.push('localhost');
}

const regexesOnlineOnly: string[] = [];

const regexesCacheFirst = [
	self.location.origin,
	// 'https://rsms.me/inter/', // TODO remove, used if using font from there
	'cdn',
	'.*\\.png$',
	'.*\\.svg$',
];

const regexesCacheOnly: string[] = [];

// If the url doesn't match any of those regexes, it will do online first

log(`[Service Worker] Origin: ${self.location.origin}`);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
self.addEventListener('install', (event: any) => {
	log('[Service Worker] Install');
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => {
				log(`[Service Worker] Creating cache: ${CACHE_NAME}`);
				return cache.addAll(urlsToPreCache);
			})
			.then(() => {
				// (self as any).skipWaiting();
				log(`cache fully fetched!`);
			}),
	);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
self.addEventListener('activate', (event: any) => {
	log('[Service Worker] Activate');
	event.waitUntil(
		caches.keys().then((cacheNames) => {
			return Promise.all(
				cacheNames.map((thisCacheName) => {
					if (thisCacheName !== CACHE_NAME) {
						log(`[Service Worker] Deleting: ${thisCacheName}`);
						return caches.delete(thisCacheName);
					}
				}),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			).then(() => (self as any).clients.claim());
		}),
	);
});

// shared with the template: never lets an HTTP error replace a cached asset
const update = createFetchAndUpdateCache({
	fetch: (request) => fetch(request),
	put: async (request, response) => (await caches.open(CACHE_NAME)).put(request, response),
	log,
});

type KeepAlive = (promise: Promise<unknown>) => void;

const cacheFirst = {
	method: (request: Request, cache?: Response, keepAlive?: KeepAlive) => {
		log(`[Service Worker] Cache first: ${request.url}`);
		const fun = update(request, cache, keepAlive);
		if (cache) {
			// served from cache: keep the worker up for the background refresh
			keepAlive?.(fun);
		}
		return cache || fun;
	},
	regexes: regexesCacheFirst,
};

const cacheOnly = {
	method: (request: Request, cache?: Response, keepAlive?: KeepAlive) => {
		log(`[Service Worker] Cache only: ${request.url}`);
		return cache || update(request, cache, keepAlive);
	},
	regexes: regexesCacheOnly,
};

const onlineFirst = {
	method: (request: Request, cache?: Response, keepAlive?: KeepAlive) => {
		log(`[Service Worker] Online first: ${request.url}`);
		return update(request, cache, keepAlive);
	},
	regexes: regexesOnlineFirst,
};

const onlineOnly = {
	method: (request: Request) => {
		log(`[Service Worker] Online only: ${request.url}`);
		return fetch(request);
	},
	regexes: regexesOnlineOnly,
};

async function getResponse(event: {
	request: Request;
	waitUntil: (promise: Promise<unknown>) => void;
}): Promise<Response | undefined> {
	const request = event.request;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const registration = (self as any).registration as ServiceWorkerRegistration;
	if (
		event.request.mode === 'navigate' &&
		event.request.method === 'GET' &&
		registration.waiting &&
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(await (self as any).clients.matchAll()).length < 2
	) {
		log('only one client, skipWaiting as we navigate the page');
		registration.waiting.postMessage('skipWaiting');
		const response = new Response('', {headers: {Refresh: '0'}});
		return response;
	}

	// TODO remove query param from matching, query param are used as config (why not use hashes then ?) const normalizedUrl = normalizeUrl(event.request.url);
	const keepAlive: KeepAlive = (promise) => event.waitUntil(promise);
	const response = await caches.match(request).then((cache) => {
		// The order matters !
		const patterns = [onlineFirst, onlineOnly, cacheFirst, cacheOnly];

		for (const pattern of patterns) {
			for (const regex of pattern.regexes) {
				if (RegExp(regex).test(request.url)) {
					return pattern.method(request, cache, keepAlive);
				}
			}
		}

		return onlineFirst.method(request, cache, keepAlive);
	});
	return response;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
self.addEventListener('fetch', (event: any) => {
	event.respondWith(getResponse(event));
});
