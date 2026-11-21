import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { memberLaunchDestination } from '@/lib/researchPreferencesServer'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your workspace • SlipSurge', robots: { index: false, follow: false } }

export default async function LaunchPage() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect('/auth/login?next=/launch')
  redirect(await memberLaunchDestination(user.id))
}
