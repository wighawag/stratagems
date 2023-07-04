import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Stratagems",
  description: "Stratagems is an infinite board game, a persistent and permission-less game where players use a specific set of colors to compete for the control of the board. Alliances and betrayal are part of the arsenal as colors mix and shift on the board.",
  themeConfig: {
    logo: "/five-gems.svg",
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      // { text: 'Examples', link: '/markdown-examples' }
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Contracts', link: '/contracts/Gems' }
    ],

    sidebar: [
      {
        text: 'Documentation',
        items: [
          // { text: 'Markdown Examples', link: '/markdown-examples' },
          { text: 'Guide', link: '/guide/getting-started' },
          // { text: 'Runtime API Examples', link: '/api-examples' },
          // { text: 'Contracts', link: '/contracts/Gems' }
          { text: 'Contracts', items: [
            { text: 'Gems', link: '/contracts/Gems' },
            {text: 'Stratagems_Implementation_route_Core', link: '/contracts/Stratagems_Implementation_route_Core'}
          ]}
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/onchain-games/stratagems' }
    ]
  }
})
