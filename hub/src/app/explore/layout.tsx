import { pageMetadata } from '@/lib/siteMetadata'

export const metadata = pageMetadata({ title: 'Explore Sports, Creators and Trends | SlipSurge', description: 'Discover live sports trends, creator communities, recent home runs, and people to follow.', path: '/explore' })

export default function ExploreLayout({ children }: { children: React.ReactNode }) { return children }
