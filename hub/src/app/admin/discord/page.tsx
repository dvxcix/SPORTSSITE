import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { DiscordBotManager } from './DiscordBotManager'
import type { DiscordConfig } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function AdminDiscordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin/discord')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') redirect('/')

  const admin = createAdminClient()
  const { data: config } = await admin.from('discord_config').select('*').eq('id', 1).single()

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-black text-white mb-1">Discord Bot</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Channel and role mappings for the SlipSurge Discord bot — every ID here is editable without a redeploy.
        The bot's own credentials (token, application ID, public key) live in Vercel env vars, never in this table.
      </p>
      <DiscordBotManager initialConfig={config as DiscordConfig | null} />
    </div>
  )
}
