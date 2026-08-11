import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.slipsurge.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin/', '/api/', '/auth/', '/onboarding', '/settings/', '/messages/', '/notifications',
        '/bookmarks', '/picks', '/dugout', '/batter-cost', '/pitcher-report', '/slate-breakdown',
        '/weather-lab', '/synergy', '/the-public', '/odds-terminal', '/daily-recap', '/marketplace',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
