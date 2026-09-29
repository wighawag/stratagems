/**
 * THE ENTRY THE PROCESSOR BUNDLE IS BUILT FROM (`pnpm build:bundle`).
 *
 * `etherfold build` and the web app's worker both run `dist/processor.bundle.js`,
 * one self-contained file whose SHA-256 IS the processor's identity (etherfold
 * ADR-0086). A published snapshot is keyed by that identity, so the tab has to run
 * the very bytes the snapshot job folded with: the web build copies this file,
 * it does not rebuild it.
 *
 * It hands back the AUTHORING object (declarations plus handlers) and names no
 * store and no contract: where the state lives is the host's choice, and what to
 * index is the source (`./source.ts`), given to `etherfold build` as
 * `INDEXING_SOURCE` and to the worker in its settings.
 */
import {stratagemsProcessor} from './processor.js';

export const createProcessor = () => stratagemsProcessor;
