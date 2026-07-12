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

  const { data: emojis } = await supabase.from('custom_emojis').select('*').order('created_at', { ascending: false })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-black text-white mb-1">Custom Emojis</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Upload a custom emoji and give it a code (letters/numbers/underscore only, no colons). Anyone can then type
        <code className="text-zinc-300 mx-1">:code:</code>
        in a post or comment and it'll render as this image wherever the text is displayed, plus it shows up in everyone's emoji picker.
      </p>
      <EmojiUploadForm userId={user.id} initialEmojis={emojis ?? []} />
    </div>
  )
}
