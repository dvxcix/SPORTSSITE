import { pageMetadata } from '@/lib/siteMetadata'

export const metadata = pageMetadata({ title: 'Odds Movement Terminal | SlipSurge', description: 'Inspect player market movement over time across sportsbooks, games, players, and prop lines.', path: '/odds-terminal', index: false })

export default function OddsTerminalLayout({ children }: { children: React.ReactNode }) { return children }
