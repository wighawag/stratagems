import {bigIntIDToXY} from '../src';
const args = process.argv.slice(2);

for (const n of args) {
	console.log(n);
	console.log(bigIntIDToXY(BigInt(n)));
}
