/**
 * WHAT AN EMBEDDED WORLD MUST DEPLOY for the app's context to work, and the
 * rocketh setup it deploys with, in ONE place, so a descendant that replaces
 * the app's contracts (its own contracts package, its own deploy scripts)
 * edits this file and not every suite that boots a world. Read by
 * `embedded/world.test.ts` and `embedded/deployments.test.ts`. Its e2e twin is
 * `MAIN_PAGE` of `web/e2e/routes.ts`, whose `contract` names the same contract.
 *
 * HERE, ONLY `APP_CONTRACT`. This template's `embedded/world.test.ts` is its
 * own: it boots `OFFLINE_DEPLOYMENT` of `$lib/offline` whole (its scripts with
 * the data and accounts they need) and imports its rocketh `config` from its
 * contracts package, so no `APP_SCRIPTS`, `config` or `extensions` here. A
 * game below names its own contracts package in its own world test, and keeps
 * this file as it is while its contract is the `Game`.
 */

/** The deployment name of the contract the app's context reads. */
export const APP_CONTRACT = 'Game' as const;
