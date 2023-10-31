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
    text: name, link: `/contracts/${name}/`
  };
});

const isRunningOnVercel = !!process.env.VERCEL;

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: isRunningOnVercel ? '/' : '/stratagems/',
  title: "Stratagems",
  description: "Stratagems is an infinite board game, a persistent and permission-less game where players use a specific set of colors to compete for the control of the board. Alliances and betrayal are part of the arsenal as colors mix and shift on the board.",
  head: [
    ['link', { rel: 'icon', href: '/icon.png' }],
    ['meta', { name: 'theme-color', content: '#9F5FED' }],
    
    ['meta', { name: 'og:url', content: 'https://stratagems.world' }],
    ['meta', { name: 'og:title', content: 'Stratagems' }],
    ['meta', { name: 'og:description', content: 'Stratagems is an infinite board game, a persistent and permission-less game where players use a specific set of colors to compete for the control of the board. Alliances and betrayal are part of the arsenal as colors mix and shift on the board.' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:locale', content: 'en' }],
    ['meta', { name: 'og:site_name', content: 'Stratagems' }],
    [
      'meta',
      { name: 'og:image', content: 'https://stratagems.world/preview.png' }
    ],

    ['meta', { name: 'twitter:url', content: 'https://stratagems.world' }],
    ['meta', { name: 'twitter:title', content: 'Stratagems' }],
    ['meta', { name: 'twitter:description', content: 'Stratagems is an infinite board game, a persistent and permission-less game where players use a specific set of colors to compete for the control of the board. Alliances and betrayal are part of the arsenal as colors mix and shift on the board.' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    [
      'meta',
      {
        name: 'twitter:image',
        content: 'https://stratagems.world/preview.png'
      }
    ],
  ],
  themeConfig: {
    logo: "/logo.png",
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/guide/getting-started/' },
      { text: 'Extend', link: `/guide/extending-the-world/` },
      { text: 'Contracts', link: `/contracts/${firstContractName}/` }
    ],

    sidebar: [
      {
        text: 'Documentation',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started/' },
          { text: 'Extending The World', link: `/guide/extending-the-world/` },
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
  },
  rewrites: {
    'contracts/:pkg.md': 'contracts/:pkg/index.md'
  }
})
