// THROWAWAY PROTOTYPE: round 2 screenshots (calm, a turn mid-volley, map only).
import {chromium} from 'playwright';
const base = process.argv[2] ?? 'http://100.71.110.44:5198/';
const b = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
async function shot(name, q, fn) {
	const p = await b.newPage({viewport: {width: 1400, height: 900}});
	p.on('pageerror', (e) => console.log(name, 'ERR', e.message));
	await p.goto(`${base}?${q}&shot=1`);
	await p.waitForFunction(() => window.ready, null, {timeout: 120000});
	await p.waitForTimeout(1500);
	if (fn) await fn(p);
	await p.screenshot({path: `shots/${name}.png`});
	await p.close();
}
const only = process.argv[3] ?? '';
const list = [
	['r2-A-calm-battle', 'variant=A&scene=showcase&x=27&z=4&d=11'],
	['r2-A-volley', 'variant=A&scene=showcase&x=27&z=4&d=11', async (p) => { await p.keyboard.press('t'); await p.waitForTimeout(450); }],
	['r2-A-after-turn', 'variant=A&scene=showcase&x=27&z=4&d=11', async (p) => { await p.keyboard.press('t'); await p.waitForTimeout(2300); }],
	['r2-A-focus', 'variant=A&scene=showcase&x=27&z=4&d=11', async (p) => { await p.mouse.move(700, 450); await p.waitForTimeout(600); }],
	['r2-A-map-only', 'variant=A&scene=skirmish&map=1'],
	['r2-A-map-uniform', 'variant=A&scene=skirmish&map=1&uniform=1'],
	['r2-B-map-uniform', 'variant=B&scene=skirmish&map=1&uniform=1'],
].filter(([n]) => n.includes(only));
for (const [n, q, fn] of list) await shot(n, q, fn);
await b.close();
