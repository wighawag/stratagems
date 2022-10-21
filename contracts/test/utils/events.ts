export function toEventArgs(arr: any[]): any[] {
	const result = [];
	for (const value of arr) {
		if (typeof value === 'object' && !value._isBigNumber) {
			result.push(Object.values(value));
		} else {
			result.push(value);
		}
	}
	return result;
}
