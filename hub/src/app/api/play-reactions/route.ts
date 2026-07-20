import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireTier } from '@/lib/requireTier'

export async function POST(req: Request) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { game_id, play_id, emoji } = await req.json()
  if (!game_id || !play_id || !emoji) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Toggle: delete if exists, insert if not
  const { data: existing } = await supabase
    .from('play_reactions')
    .select('id')
    .eq('game_id', game_id)
    .eq('play_id', play_id)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .single()

  if (existing) {
    const { error } = await supabase.from('play_reactions').delete().eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ action: 'removed' })
  }

  // Remove any other emoji by this user on this play first
  const { error: clearErr } = await supabase.from('play_reactions').delete()
    .eq('game_id', game_id).eq('play_id', play_id).eq('user_id', user.id)
  if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 })

  const { error: insertErr } = await supabase.from('play_reactions').insert({ game_id, play_id, user_id: user.id, emoji })
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  return NextResponse.json({ action: 'added' })
}

export async function GET(req: Request) {
  const gate = await requireTier('basic')
  if (gate.error) return gate.error

  const { searchParams } = new URL(req.url)
  const game_id = searchParams.get('game_id')
  if (!game_id) return NextResponse.json({ error: 'Missing game_id' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('play_reactions')
    .select('play_id, emoji, user_id')
    .eq('game_id', game_id)

  // Group by play_id → emoji → count
  const grouped: Record<string, Record<string, { count: number; mine: boolean }>> = {}
  for (const r of data ?? []) {
    if (!grouped[r.play_id]) grouped[r.play_id] = {}
    if (!grouped[r.play_id][r.emoji]) grouped[r.play_id][r.emoji] = { count: 0, mine: false }
    grouped[r.play_id][r.emoji].count++
    if (user && r.user_id === user.id) grouped[r.play_id][r.emoji].mine = true
  }

  return NextResponse.json(grouped)
}
