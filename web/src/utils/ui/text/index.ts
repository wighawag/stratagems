// based on viem.sh formatUnits
export function formatUnits(value: bigint, decimals: number | string, significantDecimals = 2) {
	if (typeof decimals === 'string') {
		if (decimals.endsWith('n')) {
			decimals = Number(decimals);
		} else {
			decimals = Number(decimals);
		}
	}
	let display = value.toString();

	const negative = display.startsWith('-');
	if (negative) display = display.slice(1);

	display = display.padStart(decimals, '0');

	let [integer, fraction] = [display.slice(0, display.length - decimals), display.slice(display.length - decimals)];
	fraction = fraction.replace(/(0+)$/, '');
	if (significantDecimals < fraction.length) {
		fraction = fraction.slice(0, significantDecimals) + '...';
	}
	return `${negative ? '-' : ''}${integer || '0'}${fraction ? `.${fraction}` : ''}`;
}
