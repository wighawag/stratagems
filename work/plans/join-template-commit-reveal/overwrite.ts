// Measurement for the 2026-10-24 specification of the port (see the plan): what one overwrite, and one same-cycle overwrite against a re-placement, do (common/'s model of the contract).
import {StratagemsContract, xyToBigIntID, Color} from '../../../common/src/index';
const A = '0xaaaa00000000000000000000000000000000000a';
const B = '0xbbbb00000000000000000000000000000000000b';
const X = xyToBigIntID(0, 0);
function fresh() {
	const s: any = {cells: {}, owners: {}, computedPoints: {}};
	new StratagemsContract(s, 7).computeMove(A, 2, {position: X, color: Color.Blue});
	return s;
}
function show(label: string, s: any) {
	const c = s.cells[X.toString()];
	console.log(
		label,
		JSON.stringify({
			owner: s.owners[X.toString()],
			color: c.color,
			life: c.life,
			stake: c.stake,
			points: s.computedPoints,
		}),
	);
}
let s = fresh();
show('A placed at 2:', s);
new StratagemsContract(s, 7).computeMove(B, 4, {position: X, color: Color.Red});
show('B overwrote at 4:', s);
// same cycle: A re-places its own live cell, B overwrites it, in both orders
s = fresh();
new StratagemsContract(s, 7).computeMove(A, 4, {position: X, color: Color.Blue});
new StratagemsContract(s, 7).computeMove(B, 4, {position: X, color: Color.Red});
show('cycle 4, A then B:', s);
s = fresh();
new StratagemsContract(s, 7).computeMove(B, 4, {position: X, color: Color.Red});
new StratagemsContract(s, 7).computeMove(A, 4, {position: X, color: Color.Blue});
show('cycle 4, B then A:', s);
