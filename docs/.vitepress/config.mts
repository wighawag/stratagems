import { defineConfig } from 'vitepress'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const contracts = fs.readdirSync(path.join(__dirname, '../contracts')).map(filename => {
  const name = path.basename(filename, '.md');
  return {
    text: name, link: `/contracts/${name}`
  };
});


// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: '/stratagems/',
  title: "Stratagems",
  description: "Stratagems is an infinite board game, a persistent and permission-less game where players use a specific set of colors to compete for the control of the board. Alliances and betrayal are part of the arsenal as colors mix and shift on the board.",
  themeConfig: {
    logo: "/five-gems.svg",
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Contracts', link: '/contracts/Gems' }
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
      { icon: 'github', link: 'https://github.com/wighawag/stratagems' }
    ]
  }
})
