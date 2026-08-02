import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ComposeEmbedForm } from './ComposeEmbedForm'

export const dynamic = 'force-dynamic'

export default async function AdminDiscordComposePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin/discord/compose')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') redirect('/')

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <a href="/admin/discord" className="text-xs text-zinc-500 hover:text-zinc-300 mb-2 inline-block">← Discord Bot</a>
      <h1 className="text-xl font-black text-white mb-1">Post to Discord</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Posts as the SlipSurge bot, not your personal account — build a rich embed (header, images, banner, links)
        and send it to any channel the bot can see.
      </p>
      <ComposeEmbedForm />
    </div>
  )
}
