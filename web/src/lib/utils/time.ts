import prettyMilliseconds, {type Options} from 'pretty-ms';

export function wait(numSeconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, numSeconds * 1000);
	});
}

export function timeToText(timeInSec: number, options?: Options): string {
	return prettyMilliseconds(Math.floor(timeInSec) * 1000, options);
}
