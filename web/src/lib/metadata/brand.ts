import config from '../../web-config.json';

/**
 * WHAT THE HOME PAGE SHOWS AS ITS TITLE, read from `src/web-config.json` so that
 * `routes/+page.svelte` is byte-identical in every repo of the template tree.
 *
 * A game changes its title by changing its config, never the page. The page is
 * inherited all the way down, and every improvement to it cascades without a
 * conflict only for as long as no descendant has edited it: the config is the
 * file each game already owns (its `name`, its `icon`), so the brand lives
 * there too.
 *
 * `logo` is OPTIONAL and absent at the template, which shows `name` as a text
 * title instead. It is a path under `web/static`, written either as it is
 * served (`/game-title.png`) or the way `icon` and `preview` are written
 * (`static/game-title.png`); both mean the same file.
 *
 * READ WITH `in`, because the key is optional: a named import of `logo` would
 * not type-check against a config that does not have one, and the template's
 * does not.
 */
export const brand: {name: string; logo?: string} = {
	name: config.name,
	logo:
		'logo' in config && typeof config.logo === 'string' && config.logo
			? config.logo.replace(/^static\//, '/')
			: undefined,
};
