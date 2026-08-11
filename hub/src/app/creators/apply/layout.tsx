import { pageMetadata } from '@/lib/siteMetadata'

export const metadata = pageMetadata({
  title: 'Become a SlipSurge Creator',
  description: 'Apply to sell premium sports content, build a private community, and manage member access with commerce powered by Whop.',
  path: '/creators/apply',
})

export default function CreatorApplyLayout({ children }: { children: React.ReactNode }) {
  return children
}
