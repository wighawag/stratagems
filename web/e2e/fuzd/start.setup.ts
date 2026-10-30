import {test as setup} from '@playwright/test';
import {startFuzd} from '../fixtures/fuzd';

/**
 * fuzd for the fuzd suite, and for nothing before it: see the note at
 * `FUZD_SUITE` in playwright.config.ts. Stopped by `stop.teardown.ts`.
 */
setup('start fuzd', async () => {
	setup.setTimeout(90_000);
	await startFuzd();
});
