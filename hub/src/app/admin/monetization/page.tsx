import { createClient } from '@/lib/supabase/server'
import { DollarSign } from 'lucide-react'
import { MonetizationSettingsForm } from '@/components/admin/MonetizationSettingsForm'
import { BookLogo } from '@/components/BookLogo'
import { fmtUsd, formatOdds } from '@/lib/parlayCalc'

export const dynamic = 'force-dynamic'

export default async function AdminMonetizationPage() {
  const supabase = await createClient()

  const { data: creators } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, is_verified, follower_count, subscription_price, created_at, stripe_connect_onboarded, stripe_connect_charges_enabled')
    .eq('account_type', 'creator')
    .order('follower_count', { ascending: false })

  const { count: totalCreators } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('account_type', 'creator')

  const { data: settingsRows } = await supabase.from('platform_settings').select('key, value')
  const settingsMap: Record<string, any> = {}
  for (const r of settingsRows ?? []) settingsMap[r.key] = r.value

  const { data: proPlanRoster } = await supabase
    .from('pro_plan_members')
    .select('creator_id, is_active, joined_at, users:creator_id(username, display_name, avatar_url)')
    .eq('is_active', true)

  const { data: payouts } = await supabase
    .from('creator_payouts')
    .select('id, creator_id, source, gross_amount, platform_fee_amount, creator_amount, status, created_at, users:creator_id(username, display_name)')
    .order('created_at', { ascending: false })
    .limit(50)

  const totalPlatformRevenue = (payouts ?? []).reduce((s, p: any) => s + (p.platform_fee_amount ?? 0), 0)

  // User-posted picks/parlays — self-reported bets for social display, not
  // money that flows through the platform. Kept separate from the Stripe
  // payout numbers above so the two aren't confused with each other.
  const { data: recentBets } = await supabase
    .from('posts')
    .select('id, post_type, book, wager_amount, potential_payout, combined_odds, pick_data, created_at, author:users!posts_author_id_fkey(username, display_name)')
    .in('post_type', ['pick', 'parlay'])
    .order('created_at', { ascending: false })
    .limit(50)

  const { count: totalPicks } = await supabase.from('posts').select('id', { count: 'exact', head: true }).eq('post_type', 'pick')
  const { count: totalParlays } = await supabase.from('posts').select('id', { count: 'exact', head: true }).eq('post_type', 'parlay')
  const totalWagered = (recentBets ?? []).reduce((s, b: any) => s + (b.wager_amount ?? 0), 0)

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <DollarSign size={20} className="text-green-400" />
        <h1 className="text-xl font-black text-white">Monetization</h1>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Creators', value: totalCreators ?? 0, color: 'text-purple-400' },
          { label: 'With Subscription', value: (creators ?? []).filter((c: any) => c.subscription_price).length, color: 'text-green-400' },
          { label: 'Pro Plan Roster', value: proPlanRoster?.length ?? 0, color: 'text-blue-400' },
          { label: 'Platform Fees Collected', value: `$${totalPlatformRevenue.toFixed(2)}`, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className={`text-2xl font-black ${s.color}`}>{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</p>
            <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Platform Settings</h2>
      <div className="mb-8">
        <MonetizationSettingsForm
          initial={{
            fee_independent_creator_pct: settingsMap.fee_independent_creator_pct ?? 10,
            fee_pro_plan_creator_pct: settingsMap.fee_pro_plan_creator_pct ?? 5,
            pro_plan_price_monthly: settingsMap.pro_plan_price_monthly ?? 9.99,
            pro_plan_stripe_price_id: settingsMap.pro_plan_stripe_price_id ?? '',
          }}
        />
      </div>

      <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Creators</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800">
            <tr>
              {['Creator', 'Followers', 'Sub Price', 'Payouts Setup', 'Joined', 'Actions'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {(creators ?? []).map((c: any) => (
              <tr key={c.id} className="hover:bg-zinc-800/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden">
                      {c.avatar_url && <img src={c.avatar_url} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div>
                      <p className="font-bold text-white">{c.display_name || c.username}</p>
                      <p className="text-xs text-zinc-500">@{c.username}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-300">{(c.follower_count ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3">
                  {c.subscription_price
                    ? <span className="text-green-400 font-bold">${c.subscription_price}/mo</span>
                    : <span className="text-zinc-600">Free</span>}
                </td>
                <td className="px-4 py-3">
                  {c.stripe_connect_charges_enabled
                    ? <span className="text-green-400 text-xs font-bold">Ready</span>
                    : c.stripe_connect_onboarded
                      ? <span className="text-amber-400 text-xs font-bold">Pending review</span>
                      : <span className="text-zinc-600 text-xs">Not started</span>}
                </td>
                <td className="px-4 py-3 text-zinc-500">{new Date(c.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <a href={`/profile/${c.username}`} target="_blank"
                    className="text-xs text-blue-400 hover:underline">View</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Picks &amp; Parlays</h2>
      <p className="text-xs text-zinc-500 mb-3">
        Self-reported bets users post to the feed — not money that flows through the platform. Wager/payout figures come from what the user typed in, unverified against any real sportsbook slip.
      </p>
      <div className="grid grid-cols-3 gap-4 mb-4">
        {[
          { label: 'Straight Picks Posted', value: totalPicks ?? 0, color: 'text-blue-400' },
          { label: 'Parlays Posted', value: totalParlays ?? 0, color: 'text-purple-400' },
          { label: 'Wagered (last 50, self-reported)', value: fmtUsd(totalWagered), color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <p className={`text-2xl font-black ${s.color}`}>{typeof s.value === 'number' ? s.value.toLocaleString() : s.value}</p>
            <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800">
            <tr>
              {['User', 'Type', 'Book', 'Odds', 'Wager', 'To Win', 'Result', 'Date'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {(recentBets ?? []).length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-zinc-600 text-sm">No picks or parlays posted yet</td></tr>
            ) : (recentBets ?? []).map((b: any) => {
              const result = b.pick_data?.result
              return (
                <tr key={b.id} className="hover:bg-zinc-800/50 transition-colors">
                  <td className="px-4 py-3 text-white font-bold">{b.author?.display_name || b.author?.username || '—'}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{b.post_type === 'parlay' ? `Parlay (${b.pick_data?.legs?.length ?? '?'} legs)` : 'Straight'}</td>
                  <td className="px-4 py-3">{b.book ? <BookLogo vendor={b.book} size={16} /> : <span className="text-zinc-600">—</span>}</td>
                  <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{formatOdds(b.combined_odds)}</td>
                  <td className="px-4 py-3 text-zinc-300">{b.wager_amount != null ? fmtUsd(Number(b.wager_amount)) : '—'}</td>
                  <td className="px-4 py-3 text-green-400 font-bold">{b.potential_payout != null && b.wager_amount != null ? fmtUsd(Number(b.potential_payout) - Number(b.wager_amount)) : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold ${result === 'win' ? 'text-green-400' : result === 'loss' ? 'text-red-400' : result === 'push' ? 'text-zinc-500' : 'text-amber-400'}`}>
                      {result === 'win' ? 'WIN' : result === 'loss' ? 'LOSS' : result === 'push' ? 'PUSH' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(b.created_at).toLocaleDateString()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">Recent Payouts</h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-800">
            <tr>
              {['Creator', 'Source', 'Gross', 'Platform Fee', 'Creator Gets', 'Status', 'Date'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-bold text-zinc-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {(payouts ?? []).length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-zinc-600 text-sm">No payouts yet</td></tr>
            ) : (payouts ?? []).map((p: any) => (
              <tr key={p.id} className="hover:bg-zinc-800/50 transition-colors">
                <td className="px-4 py-3 text-white font-bold">{p.users?.display_name || p.users?.username || '—'}</td>
                <td className="px-4 py-3 text-zinc-400 text-xs">{p.source === 'pro_plan_pool' ? 'Pro Plan Pool' : 'Independent'}</td>
                <td className="px-4 py-3 text-zinc-300">${Number(p.gross_amount).toFixed(2)}</td>
                <td className="px-4 py-3 text-zinc-500">${Number(p.platform_fee_amount).toFixed(2)}</td>
                <td className="px-4 py-3 text-green-400 font-bold">${Number(p.creator_amount).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold ${p.status === 'paid' ? 'text-green-400' : p.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
