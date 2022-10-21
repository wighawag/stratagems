const fs = require('fs');
const args = process.argv.slice(2);
const dist = 'dist';

const findSrc = 'src="/';
const reSrc = new RegExp(findSrc, 'g');
const findHref = 'href="/';
const reHref = new RegExp(findHref, 'g');

const indexHTML = fs.readFileSync(`${dist}/index.html`, 'utf-8').replace(`window._BASE`, `window.BASE`);
for (const arg of args) {
	try {
		fs.mkdirSync(`${dist}/${arg}`, {recursive: true});
	} catch (err) {}
	const numSegment = arg.split('/').length;
	let baseHref = '';
	for (let i = 0; i < numSegment; i++) {
		baseHref += '../';
	}
	fs.writeFileSync(
		`${dist}/${arg}/index.html`,
		indexHTML
			.replace(reSrc, 'src="' + baseHref)
			.replace(reHref, 'href="' + baseHref)
			.replace(`const numSegment = 0;`, `const numSegment = ${numSegment};`)
	);
}
fs.writeFileSync(`${dist}/index.html`, indexHTML.replace(reSrc, 'src="./').replace(reHref, 'href="./'));
