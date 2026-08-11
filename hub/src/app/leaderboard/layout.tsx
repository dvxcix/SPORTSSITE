import { pageMetadata } from '@/lib/siteMetadata'

export const metadata = pageMetadata({ title: 'Community Pick Leaderboard | SlipSurge', description: 'Compare public pick records from eligible SlipSurge members across every membership tier.', path: '/leaderboard' })

export default function LeaderboardLayout({ children }: { children: React.ReactNode }) { return children }
