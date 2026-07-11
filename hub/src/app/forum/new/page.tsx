import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NewThreadForm } from '@/components/forum/NewThreadForm'

export default async function NewThreadPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/forum/new')

  const { data: categories } = await supabase.from('forum_categories').select('id, name, slug').order('sort_order')
  const { category } = await searchParams

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">New Thread</h1>
      <NewThreadForm userId={user.id} categories={categories ?? []} defaultCategory={category} />
    </div>
  )
}
