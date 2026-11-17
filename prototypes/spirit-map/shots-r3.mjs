// THROWAWAY PROTOTYPE: round 3 screenshots (fights, trend arrows, your territory).
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
const volleyAt = (dt) => async (p) => {
	await p.evaluate(() => (window.timeOverride = 100));
	await p.waitForTimeout(400);
	await p.keyboard.press('t');
	await p.evaluate((dt) => (window.timeOverride = 100 + dt), dt);
	await p.waitForTimeout(600);
};
const only = process.argv[3] ?? '';
const list = [
	['r3-A-battle', 'variant=A&scene=showcase&x=27&z=4&d=11'],
	['r3-B-battle', 'variant=B&scene=showcase&x=27&z=4&d=11'],
	['r3-A-volley', 'variant=A&scene=showcase&x=27&z=4&d=11', volleyAt(0.45)],
	['r3-A-impact', 'variant=A&scene=showcase&x=27&z=4&d=11', volleyAt(0.68)],
	['r3-A-skirmish', 'variant=A&scene=skirmish'],
	['r3-A-far', 'variant=A&scene=skirmish&x=22&z=16&d=50'],
	['r4-A-mountain-border', 'variant=A&scene=skirmish&x=25&z=20&d=8'],
	['r4-B-mountain-border', 'variant=B&scene=skirmish&x=25&z=20&d=8'],
].filter(([n]) => n.includes(only));
for (const [n, q, fn] of list) await shot(n, q, fn);
await b.close();
