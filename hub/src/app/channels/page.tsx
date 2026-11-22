import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authVisibilityUnavailable } from '@/lib/blocks'
import { effectiveTier, hasFullAccessOverride, hasTierAccess, type Tier } from '@slipsurge/core/tiers'
import Link from 'next/link'
import { ArrowRight, Hash, LockKeyhole, MessageSquareText, Plus, Radio, Users } from 'lucide-react'
import { CommunityNav } from '@/components/community/CommunityNav'
import { ProductAction, ProductHero, ProductPageShell } from '@/components/product/ProductPage'

type ChannelCardData = { id: string; slug: string; name: string; description?: string | null; icon?: string | null; channel_type?: string | null; member_count?: number | null }

export const dynamic = 'force-dynamic'

export default async function ChannelsPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authVisibilityUnavailable(authError)) throw new Error('Account access could not be verified. Try again.')
  const [{ data: profile, error: profileError }, { data: channels, error }] = await Promise.all([
    // Membership overrides are private account fields. As in TierGate, verify
    // the caller first and read only that account through the server client.
    user ? createAdminClient().from('users').select('account_type,tier,beta_access_active,discord_advanced_claimed,admin_granted_tier').eq('id', user.id).single() : Promise.resolve({ data: null, error: null }),
    supabase.from('channels').select('*').order('is_pinned', { ascending: false }).order('member_count', { ascending: false }),
  ])
  if (error) throw new Error('Channels could not be loaded. Try again.')
  if (profileError || (user && !profile)) throw new Error('Membership access could not be loaded. Try again.')
  const creator = Boolean(user)
  const globalRooms = hasFullAccessOverride(profile?.account_type, profile?.beta_access_active) || hasTierAccess(effectiveTier((profile?.tier || 'free') as Tier, profile?.discord_advanced_claimed, profile?.admin_granted_tier as Tier | null), 'basic')
  const accessible = (channels ?? []).filter(channel => globalRooms || channel.group_id)
  const owned = accessible.filter(channel => channel.owner_id === user?.id)
  const community = accessible.filter(channel => channel.owner_id !== user?.id)

  return <ProductPageShell>
    <CommunityNav />
    <ProductHero icon={<Radio size={21}/>} eyebrow="Live community" title="Channels" description="Talk picks, games, and every live swing." actions={creator ? <ProductAction href="/groups/create"><Plus size={15}/> New community</ProductAction> : undefined}/>
    {creator && (
      <ChannelSection title="Your channels" eyebrow="Your communities" channels={owned} empty={<div className="rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_4%,transparent)] p-6"><h3 className="font-semibold text-[var(--text-1)]">No channels yet</h3><Link href="/groups/create" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)]">Create a community <ArrowRight size={14}/></Link></div>}/>
    )}
    <ChannelSection title="Available channels" eyebrow="Conversations" channels={community} empty={<div className="rounded-2xl border border-[rgba(var(--line-rgb),0.08)] bg-[rgba(var(--contrast-rgb),0.025)] p-10 text-center text-sm text-[var(--text-3)]">No channels are available yet.</div>}/>
  </ProductPageShell>
}

function ChannelSection({ title, eyebrow, channels, empty }: { title: string; eyebrow: string; channels: ChannelCardData[]; empty: React.ReactNode }) {
  return <section className="mt-9 min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-[var(--text-3)]">{eyebrow}</p><div className="mb-4 mt-1 flex items-center justify-between"><h2 className="text-xl font-semibold text-[var(--text-1)]">{title}</h2><span className="text-xs text-[var(--text-3)]">{channels.length}</span></div>{channels.length ? <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">{channels.map(channel => <Link key={channel.id} href={`/channels/${channel.slug}`} className="group flex min-w-0 items-center gap-4 rounded-2xl border border-[rgba(var(--line-rgb),0.08)] bg-[var(--surface)] p-4 hover:border-[color-mix(in_srgb,var(--accent)_30%,transparent)]"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[rgba(var(--contrast-rgb),0.05)] text-xl">{channel.icon || <Hash/>}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-semibold text-[var(--text-1)]">{channel.name}</h3>{channel.channel_type !== 'public' && <LockKeyhole size={12} className="text-[var(--gold)]"/>}</div><p className="mt-1 truncate text-sm text-[var(--text-3)]">{channel.description || 'Community conversation'}</p><span className="mt-2 flex items-center gap-1 text-xs text-[var(--text-3)]"><Users size={12}/>{channel.member_count ?? 0} members</span></div><MessageSquareText size={17} className="shrink-0 text-[var(--text-3)] group-hover:text-[var(--accent)]"/></Link>)}</div> : empty}</section>
}
