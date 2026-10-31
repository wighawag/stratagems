// THROWAWAY PROTOTYPE: screenshots of round 2 (four looks, near and far, the cards, the cracking).
// Usage: node shots.mjs [baseURL] (default http://127.0.0.1:5199), with `pnpm dev` up.
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
async function open(q, wait = 900) {
	await page.goto(`${base}/?${q}&ui=0`);
	await page.waitForFunction(() => window.__proto, null, {timeout: 30000});
	await page.waitForTimeout(wait);
}
const shots = [
	['r2-flat-near', 'look=flat&zoom=near'],
	['r2-rich-near', 'look=rich&zoom=near'],
	['r2-baked-near', 'look=baked&zoom=near'],
	['r2-three-near', 'look=three&zoom=near'],
	['r2-three-tilt', 'look=three&zoom=near&tilt=35'],
	['r2-rich-mid', 'look=rich&zoom=mid'],
	['r2-baked-mid', 'look=baked&zoom=mid'],
	['r2-three-mid', 'look=three&zoom=mid'],
	['r2-rich-far', 'look=rich&zoom=far'],
	['r2-baked-far', 'look=baked&zoom=far'],
	['r2-three-far', 'look=three&zoom=far'],
	['r2-rich-size-near', 'look=rich&life=size&zoom=near'],
	['r2-rich-outlines', 'look=rich&zoom=mid&outlines=1'],
	['r2-baked-dead', 'look=baked&cx=20.5&cy=2&px=120'],
	['r2-baked-evil', 'look=baked&cx=12&cy=9.6&px=96'],
	['r2-three-evil', 'look=three&cx=12&cy=9.6&px=96&tilt=35'],
];
for (const [name, q] of shots) {
	await open(q);
	await page.screenshot({path: `${out}${name}.png`});
	console.log(name, JSON.stringify(await page.evaluate(() => window.__proto)));
}
// the cards: a player's gem, and an Evil stack
await open('look=baked&zoom=mid');
await page.evaluate(() => window.__hover(1, 1, true));
await page.waitForTimeout(300);
await page.screenshot({path: `${out}r2-card-owner.png`});
await open('look=baked&cx=12&cy=9.6&px=96');
await page.evaluate(() => window.__hover(16, 10, true));
await page.waitForTimeout(300);
await page.screenshot({path: `${out}r2-card-evil.png`});
// the cracking, close, frame by frame
await open('look=baked&cx=16&cy=1.2&px=170', 600);
await page.evaluate(() => window.__turn());
for (const [ms, n] of [[300, 1], [250, 2], [350, 3], [400, 4], [700, 5]]) {
	await page.waitForTimeout(ms);
	await page.screenshot({path: `${out}r2-crack-${n}.png`, clip: {x: 400, y: 230, width: 600, height: 340}});
}
// frame rate, far, three vs pixi
for (const look of ['baked', 'three']) {
	await open(`look=${look}&zoom=far`, 3000);
	console.log('fps-far', look, await page.evaluate(() => window.__proto.fps));
}
console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('GPU stall')).slice(0, 20).join('\n'));
await browser.close();
