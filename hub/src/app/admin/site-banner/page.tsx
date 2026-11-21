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
      <h1 className="text-xl font-semibold text-[var(--text-1)] mb-1">Site Banner</h1>
      <p className="text-sm text-[var(--text-3)] mb-6">
        Publish one site-wide banner, including public pages. Members can dismiss it for the session when allowed; editing the message shows it again.
      </p>
      <SiteBannerManager initialBanner={banner as SiteBanner} />
    </div>
  )
}
