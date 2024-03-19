// TODO type it to allow json
export function copy<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

export function serializeJSONWithBigInt(json: any): any {
	if (typeof json === 'bigint') {
		return json.toString();
	} else if (typeof json === 'object') {
		if (Array.isArray(json)) {
			return json.map(serializeJSONWithBigInt);
		} else {
			const keys = Object.keys(json);
			const n = {} as any;
			for (const key of keys) {
				n[key] = serializeJSONWithBigInt(json[key]);
			}
			return n;
		}
	}
	return json;
}
