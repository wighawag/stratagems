import 'driver.js/dist/driver.css';
import {driver} from 'driver.js';
import {writable} from 'svelte/store';
import {initialContractsInfos} from '$lib/config';

const _tour = writable({running: false});
export const tour = {
	subscribe: _tour.subscribe,
};

export function startTour(callback?: () => void) {
	let interval: NodeJS.Timeout | undefined;
	const driverObj = driver({
		popoverClass: 'driverjs-theme',
		showProgress: true,
		animate: false,
		allowClose: false,
		// disableActiveInteraction: true,
		steps: [
			{
				element: '#faction-picker',
				popover: {
					title: 'Your Current Faction',
					description:
						'You create Island by tapping on the world map. Doing so establsih the current selected faction on it. To change the current faction, simply click on this icon',
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
						'Stratagems is a "simultaneous turn" game consisting of a 23h "Commit" phase where you make your moves (place new islands) and a 1h "Reveal" phase that execute every player\'s actions simultaneously. This bar will tell you about your current situation and how much time is left for the next phase.',
				},
			},
			{
				element: '#world-map',
				popover: {
					title: 'The world Map',
					description: `This is the world map and where the game take place. When the tour is over and the commit phase is on, you can place as any islands as you own ${initialContractsInfos.contracts.Stratagems.linkedData.currency.symbol}. This will popup the "Commit Panel" where you can deposit the token and wait for the next phase.`,
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
