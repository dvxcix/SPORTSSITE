import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LandingPage } from '@/components/marketing/LandingPage'
import { pageMetadata } from '@/lib/siteMetadata'
import { memberLaunchDestination } from '@/lib/researchPreferencesServer'

export const dynamic = 'force-dynamic'
export const metadata = pageMetadata({
  title: 'SlipSurge | Sports Research, Picks and Communities',
  description: 'Try free NBA and NFL research boards, browse public picks and find your community. Take a look inside SlipSurge before creating an account.',
  path: '/',
})

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect(await memberLaunchDestination(user.id))
  return <LandingPage />
}
