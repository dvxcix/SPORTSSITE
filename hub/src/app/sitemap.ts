import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.slipsurge.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const routes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }> = [
    { path: '/', priority: 1, changeFrequency: 'weekly' },
    { path: '/pricing', priority: 0.9, changeFrequency: 'weekly' },
    { path: '/explore', priority: 0.9, changeFrequency: 'hourly' },
    { path: '/sports', priority: 0.9, changeFrequency: 'hourly' },
    { path: '/creators', priority: 0.8, changeFrequency: 'daily' },
    { path: '/creators/apply', priority: 0.8, changeFrequency: 'monthly' },
    { path: '/leaderboard', priority: 0.7, changeFrequency: 'daily' },
    { path: '/blog', priority: 0.7, changeFrequency: 'weekly' },
    { path: '/about', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/faq', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/support', priority: 0.5, changeFrequency: 'monthly' },
    { path: '/responsible-gambling', priority: 0.4, changeFrequency: 'yearly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  ]

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }))
}
