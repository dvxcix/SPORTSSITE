import { pageMetadata } from '@/lib/siteMetadata'

export const metadata = pageMetadata({ title: 'MLB Pitcher Report | SlipSurge', description: 'Inspect probable starters, pitch mix, recent results, and opposing lineup performance.', path: '/pitcher-report', index: false })

export default function PitcherReportLayout({ children }: { children: React.ReactNode }) { return children }
