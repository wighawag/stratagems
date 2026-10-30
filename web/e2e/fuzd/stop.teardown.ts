import {test as teardown} from '@playwright/test';
import {stopFuzd} from '../fixtures/fuzd';

/** The fuzd `start.setup.ts` started, stopped once the fuzd suite is done. */
teardown('stop fuzd', async () => {
	await stopFuzd();
});
