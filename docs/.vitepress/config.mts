import { defineConfig } from 'vitepress'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const mainContract = 'Stratagems';

const contractFilenames = fs.readdirSync(path.join(__dirname, '../contracts'));
const contractNames = contractFilenames.map((filename) => path.basename(filename, '.md'));
const firstContractName = contractNames.indexOf(mainContract) == -1 ? contractNames[0] : mainContract;

const contracts = contractNames.sort((a,b) => a === firstContractName ? -1 : b === firstContractName ? 1 : (a > b ? 1: a <b ? -1 : 0))
.map(name => {
  return {
    text: name, link: `/contracts/${name}`
  };
});

const isRunningOnVercel = !!process.env.VERCEL;

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: isRunningOnVercel ? '/' : '/stratagems/',
  title: "Stratagems",
  description: "Stratagems is an infinite board game, a persistent and permission-less game where players use a specific set of colors to compete for the control of the board. Alliances and betrayal are part of the arsenal as colors mix and shift on the board.",
  themeConfig: {
    logo: "/five-gems.svg",
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Contracts', link: `/contracts/${firstContractName}` }
    ],

    sidebar: [
      {
        text: 'Documentation',
        items: [
          { text: 'Guide', link: '/guide/getting-started' },
          { text: 'Contracts', items: contracts}
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/wighawag/stratagems#readme' },
      { icon: 'twitter', link: 'https://twitter.com/stratagems_eth' },
      { icon: 'discord', link: 'https://discord.gg/Qb4gr2ekfr' },
    ],

    search: {
      provider: 'local'
    },

    footer: {
      message: 'Released under the GPL 3.0 License.',
      copyright: 'Copyright © 2022-present Ronan Sandford'
    }
  }
})
