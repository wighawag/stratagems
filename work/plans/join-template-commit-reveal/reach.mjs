// Which files under web/src the app can reach, walking imports from every route,
// lib/index.ts and the service worker (step 6c's measurement).
// node reach.mjs <webdir> dead [scopes]      LIVE or dead per file under the scopes
// node reach.mjs <webdir> ext                each package: files importing it, live ones
// node reach.mjs <webdir> importers <path>   who imports src/<path>
import fs from 'node:fs';
import path from 'node:path';
const web = path.resolve(process.argv[2]);
const src = path.join(web, 'src');
const aliases = {
	'$lib': 'src/lib',
	'$app-specific': 'src/lib/stratagems/game.ts',
	'$ui': 'src/lib/shadcn/ui',
	'web-config': 'src/web-config.json',
	'$data': 'src/data',
	'$utils': 'src/utils',
};
function walk(d, out = []) {
	for (const e of fs.readdirSync(d, {withFileTypes: true})) {
		const p = path.join(d, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (/\.(ts|js|svelte|json|css)$/.test(e.name)) out.push(p);
	}
	return out;
}
const all = walk(src);
const exts = ['', '.ts', '.js', '.svelte', '.json', '/index.ts', '/index.js'];
function resolve(spec, from) {
	let base = null;
	for (const [a, t] of Object.entries(aliases)) {
		if (spec === a || spec.startsWith(a + '/')) {
			base = path.join(web, t + spec.slice(a.length));
			break;
		}
	}
	if (!base && spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
	if (!base) return null;
	for (const e of exts) {
		const p = base + e;
		if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
	}
	if (base.endsWith('.js')) {
		const p = base.slice(0, -3) + '.ts';
		if (fs.existsSync(p)) return p;
	}
	return null;
}
const re = /(?:import|export)[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]|new URL\(\s*['"]([^'"]+)['"]/g;
const edges = new Map();
const external = new Map();
for (const f of all) {
	const s = fs.readFileSync(f, 'utf8');
	const deps = [];
	for (const m of s.matchAll(re)) {
		const spec = m[1] || m[2] || m[3] || m[4];
		const r = resolve(spec, f);
		if (r) deps.push(r);
		else if (!spec.startsWith('.') && !spec.startsWith('$')) {
			const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
			if (!external.has(pkg)) external.set(pkg, new Set());
			external.get(pkg).add(f);
		}
	}
	edges.set(f, deps);
}
const rel = (p) => path.relative(src, p);
const roots = all.filter((f) => {
	const r = rel(f);
	return (
		r.startsWith('routes/') ||
		r === 'lib/index.ts' ||
		r.startsWith('service-worker/') ||
		r === 'app.css' ||
		r === 'app.d.ts'
	);
});
const seen = new Set();
const stack = [...roots];
while (stack.length) {
	const f = stack.pop();
	if (seen.has(f)) continue;
	seen.add(f);
	for (const d of edges.get(f) || []) stack.push(d);
}
const mode = process.argv[3] || 'dead';
const scope = (process.argv[4] || 'lib/stratagems,utils,css,data').split(',');
const inScope = (f) => scope.some((s) => rel(f).startsWith(s));
if (mode === 'dead') {
	for (const f of all.filter(inScope).sort()) console.log((seen.has(f) ? 'LIVE ' : 'dead ') + rel(f));
} else if (mode === 'ext') {
	for (const [pkg, fs_] of [...external].sort()) {
		const files = [...fs_].map(rel);
		const live = files.filter((f) => seen.has(path.join(src, f)));
		if (process.argv[4] && !process.argv[4].split(',').includes(pkg)) continue;
		console.log(pkg, 'files', files.length, 'live', live.length, live.slice(0, 8).join(' '));
	}
} else if (mode === 'importers') {
	const target = path.join(src, process.argv[4]);
	for (const [f, ds] of edges) if (ds.includes(target)) console.log(rel(f), seen.has(f) ? 'LIVE' : 'dead');
}
