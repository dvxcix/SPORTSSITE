import { pageMetadata } from '@/lib/siteMetadata'

export const metadata = pageMetadata({ title: 'The Feed | SlipSurge', description: 'Fresh picks, market discussion, and community posts from SlipSurge members.', path: '/feed', index: false })

export default function FeedLayout({ children }: { children: React.ReactNode }) { return children }
