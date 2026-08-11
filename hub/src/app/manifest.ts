import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SlipSurge',
    short_name: 'SlipSurge',
    description: 'Sports research, live market movement, verified picks, creator communities, and real-time scores.',
    id: '/',
    scope: '/',
    start_url: '/feed',
    display: 'standalone',
    orientation: 'any',
    lang: 'en-US',
    categories: ['sports', 'social', 'utilities'],
    prefer_related_applications: false,
    background_color: '#06070A',
    theme_color: '#B4FF4D',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcuts: [
      { name: 'The Feed', short_name: 'Feed', description: 'Open your SlipSurge feed', url: '/feed', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'The Dugout', short_name: 'Dugout', description: 'Open the MLB research matrix', url: '/dugout', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Odds Terminal', short_name: 'Terminal', description: 'Open live market movement', url: '/odds-terminal', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Live Scores', short_name: 'Scores', description: 'Open live games and scores', url: '/sports', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
