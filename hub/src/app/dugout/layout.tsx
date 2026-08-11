import { pageMetadata } from '@/lib/siteMetadata'

export const metadata = pageMetadata({ title: 'The Dugout MLB Research Matrix | SlipSurge', description: 'Compare MLB batter markets, public activity, Statcast form, pitch data, and custom Matrix signals.', path: '/dugout', index: false })

export default function DugoutLayout({ children }: { children: React.ReactNode }) { return children }
