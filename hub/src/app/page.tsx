import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LandingPage } from '@/components/marketing/LandingPage'
import { pageMetadata } from '@/lib/siteMetadata'

export const dynamic = 'force-dynamic'
export const metadata = pageMetadata({
  title: 'SlipSurge | Sports Research, Picks and Community',
  description: 'Sports research, live market movement, verified picks, creator communities, and real-time scores in one platform.',
  path: '/',
})

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/feed')
  return <LandingPage />
}
