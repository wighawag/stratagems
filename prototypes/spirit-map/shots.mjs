// THROWAWAY PROTOTYPE: screenshots from headless Chromium, the dev server up.
// node shots.mjs [base-url] [filter]
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';

const base = process.argv[2] ?? 'http://127.0.0.1:5198/';
const filter = process.argv[3] ?? '';
const shots = [
	['A-showcase', 'variant=A&scene=showcase'],
	['B-showcase', 'variant=B&scene=showcase'],
	['A-close-biomes', 'variant=A&scene=showcase&x=6&z=4&d=9'],
	['B-close-biomes', 'variant=B&scene=showcase&x=6&z=4&d=9'],
	['A-battle', 'variant=A&scene=showcase&x=27&z=4&d=11'],
	['B-battle', 'variant=B&scene=showcase&x=27&z=4&d=11'],
	['A-volcanoes', 'variant=A&scene=showcase&x=9&z=18&d=10'],
	['B-volcanoes', 'variant=B&scene=showcase&x=9&z=18&d=10'],
	['A-skirmish', 'variant=A&scene=skirmish'],
	['B-skirmish', 'variant=B&scene=skirmish'],
	['A-free', 'variant=A&scene=showcase&x=17&z=4&d=9&az=0.9&polar=1.1'],
	['A-stress', 'variant=A&scene=stress'],
	['B-stress', 'variant=B&scene=stress'],
	['A-mobile', 'variant=A&scene=skirmish&x=20&z=14&d=14', {width: 390, height: 844, deviceScaleFactor: 2}],
].filter(([n]) => n.includes(filter));

mkdirSync('shots', {recursive: true});
const browser = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
for (const [name, q, vp] of shots) {
	const page = await browser.newPage({viewport: vp ?? {width: 1400, height: 900}, deviceScaleFactor: vp?.deviceScaleFactor ?? 1});
	page.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
	page.on('console', (m) => m.type() === 'error' && console.log(name, 'console', m.text()));
	await page.goto(`${base}?${q}&shot=1`);
	await page.waitForFunction(() => window.ready, null, {timeout: 120000});
	await page.waitForTimeout(2500);
	await page.screenshot({path: `shots/${name}.png`});
	const stats = await page.$eval('#stats', (e) => e.textContent);
	console.log(name, JSON.stringify(stats));
	await page.close();
}
await browser.close();
