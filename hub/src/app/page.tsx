import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LandingPage } from '@/components/marketing/LandingPage'
import { pageMetadata } from '@/lib/siteMetadata'

export const dynamic = 'force-dynamic'
export const metadata = pageMetadata({
  title: 'SlipSurge | NBA and NFL Odds Research',
  description: 'Compare saved NBA and NFL prop odds, see how prices moved before game time, and try a free research board without an account.',
  path: '/',
})

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/feed')
  return <LandingPage />
}
