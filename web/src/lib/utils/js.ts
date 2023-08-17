// TODO type it to allow json
export function copy<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}
