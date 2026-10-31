/**
 * THE LOOK'S DECISIONS (step 9 of work/plans/join-template-commit-reveal.md,
 * P9-3 and P9-5): what the board draws for a cell, as pure functions over the
 * view, so every one is tested and the pixi code only draws what they say.
 *
 * The look was chosen by the user through the prototype `proto/go-style`
 * (rounds 1 to 7): jewel gems on kaya wood, Go's four neighbours along the
 * lines. A cell's life is a dial of seven marks round the rim when an
 * intersection is at least `DIAL_PX` apart, and the stone's size below that;
 * its trend is one pulsing mark (gold where life is coming, red where it is
 * going), the same pulse for every gem; same-colour neighbours are joined by a
 * bridge along the line, different colours pinched by a red notch, dead
 * neighbours included, because the contract counts them.
 *
 * The rule itself is not here: a cell's `trend`, `friends` and `enemies` come
 * from `stratagems-common`'s copy of the contract (`../view.ts`), so the board
 * cannot draw a rule the contract does not apply.
 */
import {Color, EVIL_OWNER_ADDRESS, xyToBigIntID} from 'stratagems-common';
import type {CellView} from '../view';
import {COLOURS} from '../faction';

/** Pixels between two intersections from which the dial of marks shows. */
export const DIAL_PX = 34;
/** Pixels between two intersections from which your gems wear a bezel. */
export const BEZEL_PX = 48;
/** How far apart the hoshi, the board's landmark dots, are. */
export const HOSHI_EVERY = 8;

export type Zoom = {
	/** The dial of marks shows life; otherwise the stone's size does. */
	dial: boolean;
	/** Your gems wear the gold bezel (the ivory wash shows at every zoom). */
	bezel: boolean;
};

export function zoomOf(pixelsPerIntersection: number): Zoom {
	return {
		dial: pixelsPerIntersection >= DIAL_PX,
		bezel: pixelsPerIntersection >= BEZEL_PX,
	};
}

export function sameZoom(a: Zoom, b: Zoom): boolean {
	return a.dial === b.dial && a.bezel === b.bezel;
}

/** A planned placement: drawn as a ghost of the colour it would take. */
export function isGhost(cell: CellView): boolean {
	return cell.planned !== undefined && cell.planned !== Color.None;
}

/** A planned removal: drawn as a red cross over the gem. */
export function isRemoval(cell: CellView): boolean {
	return cell.planned === Color.None;
}

export function isDead(cell: CellView): boolean {
	return cell.life <= 0;
}

/** The stone's size by life, for when the dial does not show (0.42 to 1). */
export function sizeOf(life: number, maxLife: number): number {
	return 0.42 + (0.58 * Math.max(0, Math.min(life, maxLife))) / maxLife;
}

/** The stone's scale, 1 being a full gem filling its intersection's circle. */
export function stoneScale(
	cell: CellView,
	zoom: Zoom,
	maxLife: number,
): number {
	if (isDead(cell) && !isGhost(cell)) return zoom.dial ? 0.9 : 0.62;
	return zoom.dial ? 1 : sizeOf(cell.life, maxLife);
}

/**
 * How many marks of the dial are filled: the life the gem keeps. A shrinking
 * gem's last mark is the pending one, about to empty, so it is not counted.
 */
export function marksFilled(cell: CellView): number {
	if (isDead(cell)) return 0;
	return cell.trend === 'shrink' ? cell.life - 1 : cell.life;
}

export type PendingMark = {index: number; kind: 'grow' | 'shrink'};

/** The one mark that pulses: where life is coming to, or leaving. */
export function pendingMark(
	cell: CellView,
	maxLife: number,
): PendingMark | undefined {
	if (isGhost(cell) || isDead(cell)) return undefined;
	if (cell.trend === 'grow' && cell.life < maxLife) {
		return {index: cell.life, kind: 'grow'};
	}
	if (cell.trend === 'shrink') return {index: cell.life - 1, kind: 'shrink'};
	return undefined;
}

/** Where mark `index` of `count` sits round the rim, from the top, clockwise. */
export function markAngle(index: number, count: number): number {
	return -Math.PI / 2 + (index * 2 * Math.PI) / count;
}

/**
 * The pulse every pending mark shares, 0 to 1: one period of a little under
 * two seconds, slow and wide enough to read, the same phase on every gem.
 */
export function pulse(timeMs: number): number {
	return 0.5 + 0.5 * Math.sin((timeMs / 1000) * 4);
}

/** One grid-line segment between two neighbours, and what it carries. */
export type Link = {
	ax: number;
	ay: number;
	bx: number;
	by: number;
	kind: 'bridge' | 'notch';
	/** The bridge's colour (the two cells'), or the first cell's for a notch. */
	color: number;
	/** Either end is a planned placement: drawn fainter. */
	planned: boolean;
};

/**
 * Bridges join same-colour neighbours, notches mark a contact between two
 * colours; each pair once. Every coloured cell takes part, dead or alive,
 * because the contract judges friend or enemy by colour, not by life.
 */
export function linksOf(cells: ReadonlyMap<string, CellView>): Link[] {
	const links: Link[] = [];
	for (const cell of cells.values()) {
		if (cell.color === Color.None) continue;
		for (const [dx, dy] of [
			[1, 0],
			[0, 1],
		] as const) {
			const other = cells.get(
				xyToBigIntID(cell.x + dx, cell.y + dy).toString(),
			);
			if (!other || other.color === Color.None) continue;
			links.push({
				ax: cell.x,
				ay: cell.y,
				bx: other.x,
				by: other.y,
				kind: other.color === cell.color ? 'bridge' : 'notch',
				color: cell.color,
				planned: isGhost(cell) || isGhost(other),
			});
		}
	}
	return links;
}

function hexToHsl(hex: string): [number, number, number] {
	const n = parseInt(hex.slice(1, 7), 16);
	const r = ((n >> 16) & 255) / 255;
	const g = ((n >> 8) & 255) / 255;
	const b = (n & 255) / 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	let h = 0;
	if (d) {
		h =
			max === r
				? ((g - b) / d) % 6
				: max === g
					? (b - r) / d + 2
					: (r - g) / d + 4;
	}
	return [(h * 60 + 360) % 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	const [r, g, b] =
		h < 60
			? [c, x, 0]
			: h < 120
				? [x, c, 0]
				: h < 180
					? [0, c, x]
					: h < 240
						? [0, x, c]
						: h < 300
							? [x, 0, c]
							: [c, 0, x];
	const to = (v: number) =>
		Math.round(Math.min(1, Math.max(0, v + m)) * 255)
			.toString(16)
			.padStart(2, '0');
	return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * A faction's gem: its legacy hue (`../faction.ts`), more saturated and
 * deeper, so it reads as a sapphire, a garnet, an emerald, a topaz, an
 * amethyst. Evil is charcoal.
 */
export function gemColour(color: number): string {
	if (color === Color.Evil) return '#2a2a2a';
	const [h, s, l] = hexToHsl(COLOURS[color]?.hex ?? '#808080');
	return hslToHex(h, Math.min(1, s * 1.35 + 0.15), Math.min(0.5, l * 0.68));
}

/** `gemColour` as the number pixi takes. */
export function gemColourNumber(color: number): number {
	return parseInt(gemColour(color).slice(1), 16);
}

/**
 * Whether a cell that was living is now found dead: the moment the board plays
 * the crack. Only for the same colour: a removal (colour none) is not a death.
 */
export function startsDying(previous: CellView, next: CellView): boolean {
	return (
		previous.life > 0 &&
		next.life <= 0 &&
		next.color !== Color.None &&
		next.color === previous.color
	);
}

const EVIL_OWNER = EVIL_OWNER_ADDRESS.toLowerCase();

/** Whether a cell is lit while `owner`'s gems are focused. */
export function isLit(cell: CellView, owner: string): boolean {
	const focus = owner.toLowerCase();
	if (focus === EVIL_OWNER) return cell.color === Color.Evil;
	return cell.owner?.toLowerCase() === focus;
}

/** The key of the cell whose whole square holds a point, in cells. */
export function cellKeyAt(point: {x: number; y: number}): string {
	return xyToBigIntID(Math.round(point.x), Math.round(point.y)).toString();
}

/** How long the focus is kept after leaving a gem for empty board. */
export const HOVER_GRACE_MS = 250;

/** The hovered cell, and when the pointer left it for empty board. */
export type HoverState = {key?: string; leftAt?: number};

export type HoverEvent =
	| {type: 'enter'; key: string; at: number}
	| {type: 'leave'; at: number}
	| {type: 'tick'; at: number};

/**
 * Hover, without flicker: entering a gem focuses it at once, leaving to empty
 * board keeps it `HOVER_GRACE_MS`, so crossing the gap between two gems never
 * lets go. Returns the same object when nothing changes.
 */
export function hoverStep(state: HoverState, event: HoverEvent): HoverState {
	switch (event.type) {
		case 'enter':
			return state.key === event.key && state.leftAt === undefined
				? state
				: {key: event.key};
		case 'leave':
			return state.key === undefined || state.leftAt !== undefined
				? state
				: {key: state.key, leftAt: event.at};
		case 'tick':
			return state.leftAt !== undefined &&
				event.at - state.leftAt >= HOVER_GRACE_MS
				? {}
				: state;
	}
}
