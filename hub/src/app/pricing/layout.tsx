import { pageMetadata } from '@/lib/siteMetadata'

export const metadata = pageMetadata({ title: 'SlipSurge Memberships and Pricing', description: 'Compare SlipSurge Free and Ultimate memberships with NFL and NBA research.', path: '/pricing' })

export default function PricingLayout({ children }: { children: React.ReactNode }) { return children }
