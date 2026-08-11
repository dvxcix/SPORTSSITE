import { pageMetadata } from '@/lib/siteMetadata'

export const metadata = pageMetadata({ title: 'The Public | SlipSurge', description: 'Review public pick activity and market interest across today’s slate.', path: '/the-public', index: false })

export default function ThePublicLayout({ children }: { children: React.ReactNode }) { return children }
