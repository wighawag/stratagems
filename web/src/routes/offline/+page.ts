import {OFFLINE_WORLD_CHROME} from '$lib/offline-chrome';

/**
 * THIS SURFACE DECLARES ITS OWN CHROME, and that is the whole of this file.
 *
 * The world below owns the page, so the app's chrome would be describing an
 * account the player never chose, a connection to something that is not a
 * network, and credits the world invented. `$lib/offline-chrome` holds that
 * reasoning and what goes up there instead; `$lib/ui/chrome` holds the mechanism
 * and the test that decides which case a surface is in.
 *
 * A LOAD RATHER THAN ANYTHING THE PAGE DOES AT MOUNT. Page data is resolved
 * before the page renders and it PRERENDERS, so the world's own navbar is up in
 * the first paint. Set from a component instead, the app's chrome would be on
 * screen first and swap once hydration ran, which is the "my account changed"
 * flicker in miniature, on every single load.
 *
 * AND IT IS IN THE ROUTE'S OWN DIRECTORY, which is the placement rule rather than
 * a convenience: a repo that deletes this inherited route deletes its declaration
 * with it, whereas a route-id table somewhere central would keep an entry naming a
 * page that no longer exists.
 *
 * No `prerender`/`ssr` overrides: this route takes the layout's, like every other.
 */
export const load = () => ({surfaceChrome: OFFLINE_WORLD_CHROME});
