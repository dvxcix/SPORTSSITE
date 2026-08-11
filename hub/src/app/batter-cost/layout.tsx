import { pageMetadata } from '@/lib/siteMetadata'

export const metadata = pageMetadata({ title: 'Batter Cost Market Comparison | SlipSurge', description: 'Compare opening and current MLB batter prices across the full slate.', path: '/batter-cost', index: false })

export default function BatterCostLayout({ children }: { children: React.ReactNode }) { return children }
