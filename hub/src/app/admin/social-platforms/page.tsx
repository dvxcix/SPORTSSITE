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
      <h1 className="text-xl font-black text-white mb-1">Connected Account Platforms</h1>
      <p className="text-sm text-zinc-500 mb-6">
        These are the "connect your account" options members see in Settings — each one just captures a handle/username
        (no OAuth, nothing verified) and shows it as a badge on their profile. If you set a URL template with{' '}
        <code className="text-zinc-300 mx-1">{'{handle}'}</code> in it, the badge links out to that profile; leave it
        blank for platforms with no public profile URL (e.g. Discord).
      </p>
      <SocialPlatformManager userId={user.id} initialPlatforms={platforms ?? []} />
    </div>
  )
}
