export function timestamp(): number {
	return Math.floor(Date.now() / 1000);
}

function weeksAsFloat(num: number): number {
	return num * days(7);
}

function daysAsFloat(num: number): number {
	return num * hours(24);
}

function hoursAsFloat(num: number): number {
	return num * minutes(60);
}

function minutesAsFloat(num: number): number {
	return num * 60;
}

export function weeks(num: number): number {
	return Math.floor(num * weeksAsFloat(num));
}

export function days(num: number): number {
	return Math.floor(daysAsFloat(num));
}

export function hours(num: number): number {
	return Math.floor(hoursAsFloat(num));
}

export function minutes(num: number): number {
	return Math.floor(minutesAsFloat(num));
}

export function nextSunday() {
	const firstSunday = 259200;
	const currentTimestamp = timestamp();
	const numWeeks = Math.ceil(currentTimestamp / weeks(1));
	const theNextSunday = numWeeks * weeks(1) + firstSunday;
	return theNextSunday;
}
