// THROWAWAY PROTOTYPE: round 4, the bezel's metal (rich, jewel, kaya). With `pnpm dev` up.
import {chromium} from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const out = new URL('./shots/', import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 900, height: 560}});
for (const metal of ['gold', 'rose', 'platinum', 'bronze', 'gunmetal', 'ivory', 'onyx', 'ruby'])
	for (const [z, cam] of [['near', 'cx=8.6&cy=2.2&px=110'], ['far', 'cx=7&cy=5&px=26']]) {
		await page.goto(`${base}/?look=rich&style=jewel&board=kaya&mine=bezel&metal=${metal}&${cam}&ui=0`);
		await page.waitForFunction(() => window.__proto);
		await page.waitForTimeout(700);
		await page.screenshot({path: `${out}r4-${metal}-${z}.png`});
	}
await browser.close();
