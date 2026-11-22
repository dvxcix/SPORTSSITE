import Link from 'next/link'
import { BadgeDollarSign, ExternalLink, Layers3, Users, WalletCards } from 'lucide-react'
import { redirect } from 'next/navigation'
import { creatorAdminAuth } from '@/lib/creatorAdminAuth'
import { creatorFeePercentage, recentCreatorReceipts } from '@/lib/creatorBusiness'
import { hasCurrentCreatorAccess } from '@/lib/creatorCommerce'
import { MonetizationSettingsForm } from '@/components/admin/MonetizationSettingsForm'

export const dynamic = 'force-dynamic'

const activeStatuses = ['active', 'trialing']

export default async function AdminMonetizationPage() {
  const auth = await creatorAdminAuth()
  if ('error' in auth) redirect(auth.status===401?'/auth/login':'/settings/security')
  const admin = auth.admin
  const [creatorsResult, productsResult, entitlementsResult, eventsResult, settingResult] = await Promise.all([
    admin.from('users').select('id,username,display_name,whop_connected_company_id,creator_commerce_status').in('account_type', ['creator','admin']).order('display_name'),
    admin.from('creator_products').select('id,creator_id,title,price,currency,product_type,status,updated_at').order('updated_at', { ascending: false }),
    admin.from('creator_entitlements').select('id,creator_id,product_id,status,current_period_end').in('status', activeStatuses),
    admin.from('creator_commerce_events').select('id,creator_id,product_id,event_type,amount,currency,status,created_at').order('created_at', { ascending: false }).limit(100),
    admin.from('platform_settings').select('value,updated_at').eq('key', 'fee_independent_creator_pct').maybeSingle(),
  ])

  if ([creatorsResult,productsResult,entitlementsResult,eventsResult,settingResult].some(result=>result.error)) throw new Error('Commerce data could not be loaded. Please retry.')
  const creators = creatorsResult.data ?? []
  const products = productsResult.data ?? []
  const entitlements = (entitlementsResult.data ?? []).filter(member=>hasCurrentCreatorAccess(member))
  const events = eventsResult.data ?? []
  const receipts = recentCreatorReceipts(events)
  const creatorsById = new Map(creators.map(creator => [creator.id, creator]))
  const productsById = new Map(products.map(product => [product.id, product]))

  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]"><BadgeDollarSign size={14} /> Whop commerce</span>
          <h1 className="text-2xl font-semibold text-[var(--text-1)]">Monetization</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-2)]">Whop is the only payment system used for SlipSurge memberships, creator checkout, balances, and payouts.</p>
        </div>
        <Link href="/admin/creators" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--border-2)] bg-[var(--surface)] px-4 text-xs font-bold text-[var(--text-1)] transition-colors hover:border-[color-mix(in_srgb,var(--accent)_40%,transparent)] hover:text-[var(--accent)]">Creator Control Center <ExternalLink size={14} /></Link>
      </header>

      <div className="ss-admin-metrics mb-6 grid gap-3 grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Connected creators', value: creators.filter(row => row.whop_connected_company_id).length, icon: WalletCards },
          { label: 'Live offers', value: products.filter(row => row.status === 'active').length, icon: Layers3 },
          { label: 'Active members', value: entitlements.length, icon: Users },
          { label: 'Receipts · recent 100 events', value: receipts, icon: BadgeDollarSign },
        ].map(({ label, value, icon: Icon }) => <article key={label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><Icon size={18} className="mb-3 text-[var(--accent)]" /><strong className="block text-2xl font-semibold text-[var(--text-1)]">{typeof value === 'number' ? value.toLocaleString() : value}</strong><span className="mt-1 block text-xs text-[var(--text-3)]">{label}</span></article>)}
      </div>

      <section className="mb-8">
        <div className="mb-3"><h2 className="text-lg font-semibold text-[var(--text-1)]">Platform fee</h2><p className="mt-1 text-sm text-[var(--text-2)]">Set the default SlipSurge share for new creator offers.</p></div>
        <MonetizationSettingsForm initial={{ fee_independent_creator_pct: creatorFeePercentage(settingResult.data?.value), updatedAt: settingResult.data?.updated_at??null }} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <header className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-bold text-[var(--text-1)]">Recent Whop commerce</h2><p className="mt-1 text-xs text-[var(--text-3)]">Provider events recorded for creator products. Creator withdrawals remain in each connected Whop payout portal.</p></header>
        <div role="region" tabIndex={0} aria-label=" table, scroll for all columns" className="ss-table-region overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-[var(--border)]"><tr>{['Creator', 'Offer', 'Event', 'Amount', 'Status', 'Time'].map(label => <th key={label} className="px-4 py-3 text-left text-[12px] font-semibold uppercase tracking-wider text-[var(--text-3)]">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--border)]">{events.length ? events.map(event => {
              const creator = event.creator_id ? creatorsById.get(event.creator_id) : undefined
              const product = event.product_id ? productsById.get(event.product_id) : undefined
              return <tr key={event.id} className="transition-colors hover:bg-[color-mix(in_srgb,var(--surface-2)_50%,transparent)]"><td className="px-4 py-3 font-bold text-[var(--text-1)]">{creator?.display_name || creator?.username || 'Unknown creator'}</td><td className="px-4 py-3 text-[var(--text-2)]">{product?.title || 'Platform event'}</td><td className="px-4 py-3 text-xs text-[var(--text-2)]">{String(event.event_type).replaceAll('_', ' ')}</td><td className="px-4 py-3 font-bold text-[var(--accent)]">{event.amount == null ? 'Recorded' : `${String(event.currency || 'usd').toUpperCase()} ${Number(event.amount).toFixed(2)}`}</td><td className="px-4 py-3 text-xs font-bold text-[var(--text-2)]">{event.status || 'recorded'}</td><td className="px-4 py-3 text-xs text-[var(--text-3)]">{new Date(event.created_at).toLocaleString()}</td></tr>
            }) : <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--text-3)]">No Whop commerce events yet.</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
