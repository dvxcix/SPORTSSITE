import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PageSettingsForm } from '@/components/pages/PageSettingsForm'
import Link from 'next/link'
import { ChevronLeft, Settings2 } from 'lucide-react'
import { CommunityNav } from '@/components/community/CommunityNav'

export const dynamic = 'force-dynamic'

export default async function PageSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/pages/${slug}/settings`)

  const { data: page } = await supabase.from('pages').select('*').eq('slug', slug).single()
  if (!page) notFound()
  if (page.owner_id !== user.id) redirect(`/pages/${slug}`)

  return (
    <div className="ss-flow-page">
      <CommunityNav />
      <Link href={`/pages/${slug}`} className="ss-flow-back"><ChevronLeft size={14} /> {page.name}</Link>
      <header className="ss-flow-heading"><span><Settings2 size={22} /></span><div><p>Page controls</p><h1>Page settings</h1></div></header>
      <PageSettingsForm page={page} />
    </div>
  )
}
