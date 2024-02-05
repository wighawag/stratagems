import 'driver.js/dist/driver.css';
import {driver} from 'driver.js';
import {writable} from 'svelte/store';

const _tour = writable({running: false});
export const tour = {
	subscribe: _tour.subscribe,
};

export function startTour(callback?: () => void) {
	let interval: NodeJS.Timeout | undefined;
	const driverObj = driver({
		// showProgress: true,
		animate: false,
		allowClose: false,
		// disableActiveInteraction: true,
		steps: [
			{
				element: '#faction-picker',
				popover: {
					title: 'Your Current Faction',
					description:
						'This will be the faction used when you click on the map to create islamd. Click on it to switch factions',
				},
			},
			{
				element: '#account-button',
				popover: {
					title: 'Menu',
					description:
						'This icon represent your account, After this little tour is over, you can click on it to open a menu.',
				},
			},
			{
				element: '#info-bar',
				popover: {
					title: 'The Info bar',
					description:
						'This bar will tell you about your current situation and how much time is left for the next phase.',
				},
			},
			{
				element: '#world-map',
				popover: {
					title: 'The world Map',
					description:
						'This is where the game takes place and where you can create island and capture the tokens from other islands.',
				},
			},
			//   { element: '#action-panel', popover: { title: 'Title', description: 'Description' } },
		],
		onDestroyed(elem) {
			if (interval) {
				clearInterval(interval);
			}
			_tour.set({running: false});
			callback && callback();
		},
	});
	interval = setInterval(() => {
		if (driverObj) {
			// needed if elements moves
			driverObj.refresh();
		}
	}, 200);
	_tour.set({running: true});
	driverObj.drive();
}
