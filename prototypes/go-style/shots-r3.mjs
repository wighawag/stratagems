// THROWAWAY PROTOTYPE: round 3 screenshots (materials, boards, "yours", the wash, 3D). With `pnpm dev` up.
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
const base = process.argv[2] ?? 'http://127.0.0.1:5199';
const out = new URL('./shots/', import.meta.url).pathname;
mkdirSync(out, {recursive: true});
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1400, height: 860}});
const logs = [];
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
const near = 'cx=4.5&cy=2.2&px=104';
const shots = [];
for (const style of ['jewel', 'yunzi', 'lacquer']) shots.push([`r3-rich-${style}-kaya`, `look=rich&style=${style}&board=kaya&mine=halo&${near}`]);
for (const board of ['slate', 'washi', 'felt']) for (const style of ['yunzi', 'lacquer']) shots.push([`r3-rich-${style}-${board}`, `look=rich&style=${style}&board=${board}&mine=halo&${near}`]);
for (const mine of ['halo', 'bezel', 'tile']) {
	shots.push([`r3-mine-${mine}-near`, `look=rich&style=yunzi&board=kaya&mine=${mine}&${near}`]);
	shots.push([`r3-mine-${mine}-far`, `look=rich&style=yunzi&board=kaya&mine=${mine}&cx=6&cy=4&px=20`]);
}
shots.push(['r3-baked-fixed', 'look=baked&board=kaya&mine=halo&cx=4.5&cy=2.2&px=104']);
shots.push(['r3-wash', 'look=rich&style=yunzi&board=kaya&zoom=mid&outlines=1']);
shots.push(['r3-wash-far', 'look=rich&style=yunzi&board=kaya&zoom=far&outlines=1']);
for (const style of ['jewel', 'yunzi', 'lacquer']) shots.push([`r3-three-${style}`, `look=three&style=${style}&board=kaya&mine=bezel&tilt=55&az=-15&cx=9.6&cy=2.2&px=230`]);
shots.push(['r3-three-evil', 'look=three&style=lacquer&board=kaya&tilt=60&az=-20&cx=14&cy=9.6&px=200']);
shots.push(['r3-three-slate', 'look=three&style=yunzi&board=slate&mine=halo&tilt=50&az=25&cx=1.5&cy=1&px=200']);
shots.push(['r3-three-top', 'look=three&style=yunzi&board=kaya&mine=halo&tilt=0&cx=9.6&cy=2.2&px=150']);
shots.push(['r3-three-far', 'look=three&style=yunzi&board=kaya&tilt=40&cx=40&cy=11&px=18']);
const only = process.argv[3];
for (const [name, q] of shots.filter(([n]) => !only || n.includes(only))) {
	await page.goto(`${base}/?${q}&ui=0`);
	await page.waitForFunction(() => window.__proto, null, {timeout: 30000});
	await page.waitForTimeout(name.includes('three') ? 1500 : 800);
	await page.screenshot({path: `${out}${name}.png`});
	console.log(name, JSON.stringify(await page.evaluate(() => ({fps: window.__proto.fps, three: window.__proto.three}))));
}
console.log(logs.join('\n'));
await browser.close();
