import { pageMetadata } from '@/lib/siteMetadata'

export const metadata = pageMetadata({ title: 'Synergy Research | SlipSurge', description: 'Cross-reference player, pitcher, market, and game signals in one research view.', path: '/synergy', index: false })

export default function SynergyLayout({ children }: { children: React.ReactNode }) { return children }
