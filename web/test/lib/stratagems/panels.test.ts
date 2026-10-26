import {describe, expect, it} from 'vitest';
import {Color} from 'stratagems-common';
import type {ViewStateValue} from '$lib/game/core/seams';
import type {BoardView, CellView} from '$lib/stratagems/view';
import {
	describeCell,
	describeLeaderboard,
	describeTestGems,
	describeWinnings,
	shortAddress,
} from '$lib/stratagems/hud/panels';
import {REFUSED_OTHERS} from '$lib/stratagems/planning';
import {ALICE, BOB, GEM, MAX_LIFE, at} from './board';

function view(cells: Partial<CellView>[]): ViewStateValue<BoardView> {
	return {
		step: 'Loaded',
		cycleNumber: 7,
		cells: new Map(
			cells.map((cell) => [
				cell.position!.toString(),
				{
					x: 0,
					y: 0,
					color: 0,
					life: 0,
					stake: 0,
					owner: undefined,
					mine: false,
					...cell,
				} as CellView,
			]),
		),
	};
}

describe('the cell panel', () => {
	it('describes a living cell of another player, and why it cannot be played', () => {
		const panel = describeCell({
			selected: {
				position: at(1, 0),
				judgement: {kind: 'refused', reason: REFUSED_OTHERS},
				reason: REFUSED_OTHERS,
				canRemove: false,
			},
			view: view([
				{position: at(1, 0), color: Color.Red, life: 4, stake: 2, owner: BOB},
			]),
			maxLife: MAX_LIFE,
		});
		expect(panel).toEqual({
			title: 'Cell 1,0',
			colour: {name: 'Red', hex: '#c5836e'},
			lifeLabel: 'life 4 of 7',
			stakeLabel: '2 gems at stake',
			ownerLabel: shortAddress(BOB),
			plannedLabel: undefined,
			reason: REFUSED_OTHERS,
			canRemove: false,
		});
	});

	it("is the land menu on the player's own full-life cell", () => {
		const panel = describeCell({
			selected: {
				position: at(5, 5),
				judgement: {kind: 'remove'},
				canRemove: true,
			},
			view: view([
				{
					position: at(5, 5),
					color: Color.Blue,
					life: 7,
					stake: 1,
					owner: ALICE,
					mine: true,
				},
			]),
			maxLife: MAX_LIFE,
		});
		expect(panel).toMatchObject({
			ownerLabel: 'yours',
			stakeLabel: '1 gem at stake',
			canRemove: true,
		});
		expect(panel?.reason).toBeUndefined();
	});

	it('says what is planned on a cell, and calls an empty or dead one so', () => {
		expect(
			describeCell({
				selected: {position: at(9, 9), planned: Color.Green, canRemove: false},
				view: view([]),
				maxLife: MAX_LIFE,
			}),
		).toMatchObject({
			title: 'Cell 9,9, as planned',
			lifeLabel: 'empty',
			plannedLabel: 'Planned: a Green gem',
		});
		expect(
			describeCell({
				selected: {position: at(5, 5), planned: Color.None, canRemove: false},
				view: view([
					{position: at(5, 5), color: Color.Blue, life: 0, stake: 0},
				]),
				maxLife: MAX_LIFE,
			}),
		).toMatchObject({
			lifeLabel: 'dead',
			plannedLabel: 'Planned: remove it (its gem comes back)',
		});
		expect(
			describeCell({selected: undefined, view: view([]), maxLife: MAX_LIFE}),
		).toBeUndefined();
	});
});

describe('the other panels', () => {
	const currency = {symbol: 'GEMS', decimals: 18};

	it('show winnings only when something is owed', () => {
		expect(
			describeWinnings(
				{shares: [], total: 0n, collecting: {step: 'Idle'}},
				currency,
			),
		).toBeUndefined();
		expect(
			describeWinnings(
				{
					shares: [
						{position: at(1, 0), from: at(0, 0), amount: GEM / 2n},
						{position: at(1, 0), from: at(2, 1), amount: GEM},
					],
					total: (3n * GEM) / 2n,
					collecting: {step: 'Error', message: 'rejected'},
				},
				currency,
			),
		).toEqual({
			label: '1.5 GEMS to collect',
			cells: 1,
			busy: false,
			error: 'rejected',
		});
	});

	it('label the leaderboard, the viewer as "you"', () => {
		expect(
			describeLeaderboard(
				[
					{
						player: ALICE,
						earned: GEM + GEM / 4n,
						points: 3n * GEM,
						lands: 2,
						mine: false,
					},
					{player: BOB, earned: 0n, points: 0n, lands: 0, mine: true},
				],
				{decimals: 18, numTokensPerGems: GEM},
			),
		).toEqual([
			{
				rank: 1,
				player: shortAddress(ALICE),
				earned: '1.25',
				points: '3',
				lands: 2,
				mine: false,
			},
			{
				rank: 2,
				player: 'you',
				earned: '0.00',
				points: '0',
				lands: 0,
				mine: true,
			},
		]);
	});

	it('offer test gems where available, with a hint when the wallet is short', () => {
		expect(
			describeTestGems({
				state: {step: 'Unavailable'},
				stakeAmount: 32n * GEM,
				currency,
			}),
		).toBeUndefined();
		expect(
			describeTestGems({
				state: {available: true, step: 'Idle'},
				tokenBalance: GEM,
				stakeAmount: 32n * GEM,
				currency,
			}),
		).toMatchObject({
			label: 'Get 15 test gems',
			busy: false,
			hint: 'Your wallet holds 1 gems and a stake takes 32. This deployment hands out test gems for free.',
		});
		expect(
			describeTestGems({
				state: {available: true, step: 'Sending'},
				tokenBalance: 100n * GEM,
				stakeAmount: 32n * GEM,
				currency,
			}),
		).toEqual({
			label: 'Getting test gems...',
			busy: true,
			hint: undefined,
			error: undefined,
		});
	});
});
