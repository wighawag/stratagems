const toml = require('toml');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const wranglerConfigStr = fs.readFileSync(path.join(__dirname, 'wrangler.toml'), 'utf-8');
const config = toml.parse(wranglerConfigStr);

if (config.triggers?.crons) {
    for (const trigger of config.triggers.crons) {
        cron.schedule(trigger, () => {
            console.log(`triggering ${trigger} ... `)
            fetch(`http://localhost:34002/cdn-cgi/mf/scheduled?cron=${trigger}`)
        })
    }
}