import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { EmojiUploadForm } from './EmojiUploadForm'

export const dynamic = 'force-dynamic'

export default async function AdminEmojisPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin/emojis')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') redirect('/')

  const [{ data: emojis }, { data: categories }] = await Promise.all([
    supabase.from('custom_emojis').select('*, category:custom_emoji_categories(name)').order('created_at', { ascending: false }),
    supabase.from('custom_emoji_categories').select('*').order('sort_order').order('name'),
  ])

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-[var(--text-1)] mb-1">Custom Emojis</h1>
      <p className="text-sm text-[var(--text-3)] mb-6">
        Upload an image, give it a code, and choose a category. Members can use :code: in posts and comments, or find it in the emoji picker.
      </p>
      <EmojiUploadForm userId={user.id} initialEmojis={emojis ?? []} initialCategories={categories ?? []} />
    </div>
  )
}
