import type {Color} from 'stratagems-common';

export function getFactionIcon(color: Color): string {
	let src = '/game-assets/blue.png';

	switch (color) {
		case 0:
			src = '/game-assets/withdrawal.png';
			break;
		case 1:
			src = '/game-assets/blue.png';
			break;
		case 2:
			src = '/game-assets/red.png';
			break;
		case 3:
			src = '/game-assets/green.png';
			break;
		case 4:
			src = '/game-assets/yellow.png';
			break;
		case 5:
			src = '/game-assets/purple.png';
			break;
		case 6:
			src = '/game-assets/black.png';
			break;
	}
	return src;
}
