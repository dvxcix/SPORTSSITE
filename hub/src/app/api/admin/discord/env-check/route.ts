import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

// One-shot diagnostic for the "DISCORD_BOT_TOKEN is not configured" runtime
// error persisting across confirmed-fresh deployments — reports presence
// only (never the value) so this is safe to check from a browser tab.
export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  return NextResponse.json({
    hasBotToken: !!process.env.DISCORD_BOT_TOKEN,
    hasApplicationId: !!process.env.DISCORD_APPLICATION_ID,
    hasPublicKey: !!process.env.DISCORD_PUBLIC_KEY,
  })
}
