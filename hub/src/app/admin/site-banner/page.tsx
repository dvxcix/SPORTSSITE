import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SiteBannerManager } from './SiteBannerManager'
import type { SiteBanner } from '@/lib/banner'

export const dynamic = 'force-dynamic'

export default async function AdminSiteBannerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin/site-banner')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') redirect('/')

  const { data: banner } = await supabase.from('site_banner').select('*').eq('id', 1).single()

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-black text-white mb-1">Site Banner</h1>
      <p className="text-sm text-zinc-500 mb-6">
        A sticky announcement bar across the top of every page (public pages included, before sign-in) — maintenance
        notices, launch/beta announcements, whatever needs to be seen. Only one can be active at a time. Members can
        dismiss it for their session if you leave it dismissible; editing the message brings it back for anyone who
        already dismissed the old one.
      </p>
      <SiteBannerManager initialBanner={banner as SiteBanner} />
    </div>
  )
}
