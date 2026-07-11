import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { PageSettingsForm } from '@/components/pages/PageSettingsForm'

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
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">Page Settings</h1>
      <PageSettingsForm page={page} />
    </div>
  )
}
