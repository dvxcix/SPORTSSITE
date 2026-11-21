import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SocialPlatformManager } from './SocialPlatformManager'

export const dynamic = 'force-dynamic'

export default async function AdminSocialPlatformsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin/social-platforms')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') redirect('/')

  const { data: platforms } = await supabase.from('social_platforms').select('*').order('sort_order').order('name')

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-[var(--text-1)] mb-1">Connected Account Platforms</h1>
      <p className="text-sm text-[var(--text-3)] mb-6">
        Add self-reported member profile links. Use <code>{'{handle}'}</code> in the URL template to link to a public profile; leave it blank when no public profile exists.
      </p>
      <SocialPlatformManager userId={user.id} initialPlatforms={platforms ?? []} />
    </div>
  )
}
