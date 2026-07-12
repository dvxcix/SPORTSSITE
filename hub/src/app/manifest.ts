import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SlipSurge',
    short_name: 'SlipSurge',
    description: 'Live scores, picks, community channels, and creator content — all in one place.',
    start_url: '/feed',
    display: 'standalone',
    background_color: '#06070A',
    theme_color: '#B4FF4D',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
