import Link from 'next/link'
import { BadgeDollarSign, ExternalLink, Layers3, Users, WalletCards } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { MonetizationSettingsForm } from '@/components/admin/MonetizationSettingsForm'

export const dynamic = 'force-dynamic'

const activeStatuses = ['active', 'trialing']

export default async function AdminMonetizationPage() {
  const admin = createAdminClient()
  const [creatorsResult, productsResult, entitlementsResult, eventsResult, settingResult] = await Promise.all([
    admin.from('users').select('id,username,display_name,whop_connected_company_id,creator_commerce_status').eq('account_type', 'creator').order('display_name'),
    admin.from('creator_products').select('id,creator_id,title,price,currency,product_type,status,updated_at').order('updated_at', { ascending: false }),
    admin.from('creator_entitlements').select('id,creator_id,product_id,status').in('status', activeStatuses),
    admin.from('creator_commerce_events').select('id,creator_id,product_id,event_type,amount,currency,status,created_at').order('created_at', { ascending: false }).limit(100),
    admin.from('platform_settings').select('value').eq('key', 'fee_independent_creator_pct').maybeSingle(),
  ])

  const creators = creatorsResult.data ?? []
  const products = productsResult.data ?? []
  const entitlements = entitlementsResult.data ?? []
  const events = eventsResult.data ?? []
  const recordedGmv = events
    .filter(event => event.event_type === 'payment.succeeded' && event.amount != null)
    .reduce((sum, event) => sum + Number(event.amount), 0)
  const creatorsById = new Map(creators.map(creator => [creator.id, creator]))
  const productsById = new Map(products.map(product => [product.id, product]))

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-lime-300"><BadgeDollarSign size={14} /> Whop commerce</span>
          <h1 className="text-2xl font-black text-white">Monetization</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">Whop is the only payment system used for SlipSurge memberships, creator checkout, balances, and payouts.</p>
        </div>
        <Link href="/admin/creators" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-xs font-bold text-zinc-200 transition-colors hover:border-lime-400/40 hover:text-lime-300">Creator Control Center <ExternalLink size={14} /></Link>
      </header>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Connected creators', value: creators.filter(row => row.whop_connected_company_id).length, icon: WalletCards },
          { label: 'Live offers', value: products.filter(row => row.status === 'active').length, icon: Layers3 },
          { label: 'Active members', value: entitlements.length, icon: Users },
          { label: 'Recorded GMV', value: `$${recordedGmv.toFixed(2)}`, icon: BadgeDollarSign },
        ].map(({ label, value, icon: Icon }) => <article key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><Icon size={18} className="mb-3 text-lime-300" /><strong className="block text-2xl font-black text-white">{typeof value === 'number' ? value.toLocaleString() : value}</strong><span className="mt-1 block text-xs text-zinc-500">{label}</span></article>)}
      </div>

      <section className="mb-8">
        <div className="mb-3"><h2 className="text-sm font-bold uppercase tracking-wider text-zinc-300">Platform fee</h2><p className="mt-1 text-xs text-zinc-500">Applied when a creator publishes a new Whop offer.</p></div>
        <MonetizationSettingsForm initial={{ fee_independent_creator_pct: Number(settingResult.data?.value ?? 15) }} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <header className="border-b border-zinc-800 px-4 py-3"><h2 className="text-sm font-bold text-white">Recent Whop commerce</h2><p className="mt-1 text-xs text-zinc-500">Provider events recorded for creator products. Creator withdrawals remain in each connected Whop payout portal.</p></header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-zinc-800"><tr>{['Creator', 'Offer', 'Event', 'Amount', 'Status', 'Time'].map(label => <th key={label} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-wider text-zinc-500">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-zinc-800">{events.length ? events.map(event => {
              const creator = event.creator_id ? creatorsById.get(event.creator_id) : undefined
              const product = event.product_id ? productsById.get(event.product_id) : undefined
              return <tr key={event.id} className="transition-colors hover:bg-zinc-800/50"><td className="px-4 py-3 font-bold text-white">{creator?.display_name || creator?.username || 'Unknown creator'}</td><td className="px-4 py-3 text-zinc-300">{product?.title || 'Platform event'}</td><td className="px-4 py-3 text-xs text-zinc-400">{String(event.event_type).replaceAll('_', ' ')}</td><td className="px-4 py-3 font-bold text-lime-300">{event.amount == null ? 'Recorded' : `${String(event.currency || 'usd').toUpperCase()} ${Number(event.amount).toFixed(2)}`}</td><td className="px-4 py-3 text-xs font-bold text-zinc-300">{event.status || 'recorded'}</td><td className="px-4 py-3 text-xs text-zinc-500">{new Date(event.created_at).toLocaleString()}</td></tr>
            }) : <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-600">No Whop commerce events yet.</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
