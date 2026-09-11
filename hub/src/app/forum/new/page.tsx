import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NewThreadForm } from '@/components/forum/NewThreadForm'
import { CommunityNav } from '@/components/community/CommunityNav'
import Link from 'next/link'
import { ArrowLeft, MessageSquarePlus } from 'lucide-react'

export default async function NewThreadPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/forum/new')

  const { data: categories } = await supabase.from('forum_categories').select('id, name, slug').order('sort_order')
  const { category } = await searchParams

  return (
    <main className="ss-flow-page">
      <CommunityNav />
      <Link href="/forum" className="ss-flow-back"><ArrowLeft size={15} /> Forum</Link>
      <header className="ss-flow-heading"><span><MessageSquarePlus size={19} /></span><div><p>Start a conversation</p><h1>New thread</h1></div></header>
      <NewThreadForm userId={user.id} categories={categories ?? []} defaultCategory={category} />
    </main>
  )
}
