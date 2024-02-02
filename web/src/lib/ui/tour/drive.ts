import "driver.js/dist/driver.css";
import { driver } from "driver.js";

export function startTour() {
    let interval: NodeJS.Timeout | undefined;
    const driverObj = driver({
        showProgress: true,
        animate: false,
        allowClose: false,
        disableActiveInteraction: true,
        steps: [
          { element: '#faction-picker', popover: { title: 'Your Current Faction', description: 'This will be the faction used when you click on the map to create islamd. Click on it to switch factions' } },
          { element: '#account-button', popover: { title: 'Menu', description: 'This icon represent your account, click on it to open a menu.' } },
          { element: '#info-bar', popover: { title: 'Time Left', description: 'This bar will tell you about your current situation and how much time is left for the next phase.' } },
        //   { element: '#action-panel', popover: { title: 'Title', description: 'Description' } },
        ],
        onDestroyed(elem) {
            if (interval) {
                clearInterval(interval);
            }
        }
      });
    interval = setInterval(() => {
        if (driverObj) {
            // needed if elements moves
            driverObj.refresh(); 
        }
    }, 200);
    driverObj.drive();
      
}