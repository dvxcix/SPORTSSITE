import { pageMetadata } from '@/lib/siteMetadata'

export const metadata = pageMetadata({ title: 'Daily MLB Recap | SlipSurge', description: 'Review confirmed home runs, first home runs, near home runs, and their complete pregame research cards.', path: '/daily-recap', index: false })

export default function DailyRecapLayout({ children }: { children: React.ReactNode }) { return children }
