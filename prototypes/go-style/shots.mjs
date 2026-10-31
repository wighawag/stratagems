// THROWAWAY PROTOTYPE: screenshots of every variant at near and far zoom, and the ownership layers.
// Usage: node shots.mjs [baseURL] (default http://127.0.0.1:5199)
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const out = new URL('./shots/', import.meta.url).pathname;
mkdirSync(out, {recursive: true});
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1400, height: 860}});
const logs = [];
page.on('console', (m) => logs.push(m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
const shots = [
	['a-near', 'variant=a&zoom=near'],
	['a-mid', 'variant=a&zoom=mid'],
	['a-far', 'variant=a&zoom=far'],
	['b-near', 'variant=b&zoom=near'],
	['b-far', 'variant=b&zoom=far'],
	['c-near', 'variant=c&zoom=near&links=0'],
	['c-far', 'variant=c&zoom=far&links=0'],
	['a-ladders-near', 'variant=a&cx=6&cy=8.6&px=84'],
	['b-ladders-near', 'variant=b&cx=6&cy=8.6&px=84'],
	['c-ladders-near', 'variant=c&links=0&cx=6&cy=8.6&px=84'],
	['a-dead-near', 'variant=a&cx=20.5&cy=2&px=120'],
	['b-dead-near', 'variant=b&cx=20.5&cy=2&px=120'],
	['a-evil-near', 'variant=a&cx=11&cy=9.6&px=90'],
	['a-stake-near', 'variant=a&cx=16&cy=6.8&px=130'],
	['owner-focus', 'variant=a&zoom=mid&focus=0x8ba1f109551bd432803012645ac136ddd64dba72'],
	['owners-overlay', 'variant=a&zoom=near&owners=1'],
	['owners-outlines', 'variant=a&zoom=near&owners=1&outlines=1'],
];
for (const [name, q] of shots) {
	await page.goto(`${base}/?${q}&ui=0`);
	await page.waitForFunction(() => window.__proto, null, {timeout: 20000});
	await page.waitForTimeout(700);
	await page.screenshot({path: `${out}${name}.png`});
	console.log(name, JSON.stringify(await page.evaluate(() => window.__proto)));
}
// the cycle turn, mid-animation and after
await page.goto(`${base}/?variant=a&zoom=near&ui=0`);
await page.waitForFunction(() => window.__proto);
await page.waitForTimeout(500);
await page.evaluate(() => window.__turn());
await page.waitForTimeout(650);
await page.screenshot({path: `${out}a-turn-mid.png`});
await page.waitForTimeout(1200);
await page.screenshot({path: `${out}a-turn-after.png`});
// a dying stone, close, through the turn
for (const v of ['a', 'c']) {
	await page.goto(`${base}/?variant=${v}&cx=16&cy=1.2&px=150&ui=0`);
	await page.waitForFunction(() => window.__proto);
	await page.waitForTimeout(500);
	await page.screenshot({path: `${out}${v}-dying-before.png`});
	await page.evaluate(() => window.__turn());
	await page.waitForTimeout(480);
	await page.screenshot({path: `${out}${v}-dying-cracking.png`});
	await page.waitForTimeout(350);
	await page.screenshot({path: `${out}${v}-dying-fading.png`});
}
// frame rate with the full board at far zoom, animating
await page.goto(`${base}/?variant=a&zoom=far`);
await page.waitForFunction(() => window.__proto);
await page.waitForTimeout(3000);
console.log('fps-far', await page.evaluate(() => window.__proto && document.getElementById('status').textContent), await page.evaluate(() => (window.__proto.fps)));
console.log(logs.filter((l) => !l.includes('[vite]')).slice(0, 20).join('\n'));
await browser.close();
