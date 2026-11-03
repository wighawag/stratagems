/**
 * WHAT THE HUD SAYS AT A TABLE'S END (step L4, L4-18): nothing until it has
 * ended; then the settlement, offered to anyone while cells hold gems; once
 * settled, the winner (or the tie) and the withdrawal.
 */
import {describe, expect, it} from 'vitest';
import {
	describeTableEnd,
	describeTableValuation,
	type TableEndState,
} from '$lib/stratagems/table-end';
import {ALICE, BOB} from './board';

const lower = (a: string) => a.toLowerCase() as `0x${string}`;
const loaded = (
	over: Partial<Extract<TableEndState, {step: 'Loaded'}>>,
): TableEndState => ({
	step: 'Loaded',
	options: {stakeGems: 10, gapPercent: 50},
	stake: 10n,
	started: true,
	ended: false,
	settled: false,
	unsettled: 0,
	rows: [],
	valued: true,
	...over,
});
const label = (p: string) => `<${p.slice(-4)}>`;

describe("a table's end", () => {
	it('says nothing before the end', () => {
		expect(describeTableEnd({step: 'Unavailable'}, {label})).toBeUndefined();
		expect(describeTableEnd(loaded({}), {label})).toBeUndefined();
	});

	it('offers the settlement once ended, saying how many cells still hold gems', () => {
		const model = describeTableEnd(loaded({ended: true, unsettled: 7}), {
			label,
		});
		expect(model).toMatchObject({
			canSettle: true,
			canWithdraw: false,
			winners: [],
		});
		expect(model?.status).toMatch(/7 cells still hold gems/);
	});

	it('names the winner once settled, the viewer as you, and offers the withdrawal to a member with a reserve', () => {
		const rows = [
			{player: lower(ALICE), score: 3n, winner: true},
			{player: lower(BOB), score: -3n, winner: false},
		];
		const model = describeTableEnd(loaded({ended: true, settled: true, rows}), {
			label,
			viewer: ALICE,
			reserve: 13n,
		});
		expect(model).toMatchObject({
			canSettle: false,
			canWithdraw: true,
			winners: ['you'],
		});
		expect(model?.status).toBe('Settled. The winner: you.');
		const tie = describeTableEnd(
			loaded({
				ended: true,
				settled: true,
				rows: rows.map((r) => ({...r, winner: true})),
			}),
			{label, viewer: BOB, reserve: 0n},
		);
		expect(tie?.status).toMatch(/A tie between/);
		expect(tie?.canWithdraw).toBe(false);
	});
});

describe("what a table's leaderboard says its numbers are", () => {
	it('values in the background, as of a cycle, then says the scores are final', () => {
		expect(describeTableValuation(loaded({started: false}))).toBeUndefined();
		expect(describeTableValuation(loaded({}))).toBe('Valuing the board...');
		expect(
			describeTableValuation(loaded({valuedAt: 50, valuedAtTableCycle: 2})),
		).toBe('Net gems as the end would pay them, as of cycle 2.');
		expect(describeTableValuation(loaded({settled: true}))).toMatch(
			/^Final scores/,
		);
	});
});
