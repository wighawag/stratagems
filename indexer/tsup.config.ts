import {defineConfig} from 'tsup';

export default defineConfig({
	// `src/stratagems-contract.ts` imports stratagems-common's SOURCE modules (so the
	// processor bundle does not drag in the commitment helpers and node's `crypto`).
	// Those are TypeScript files with extensionless imports, which no Node consumer
	// of this library's dist can load, so they are compiled INTO it.
	noExternal: [/^stratagems-common\/src\//],
});
