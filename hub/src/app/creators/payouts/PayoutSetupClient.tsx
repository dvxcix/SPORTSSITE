'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Check, ChevronRight, Clock3, Info, Loader2, LockKeyhole, RefreshCw, Search, ShieldCheck, WalletCards } from 'lucide-react'
import { CreatorDialog } from '@/components/creator/CreatorDialog'
import { creatorRevenue, type CreatorPayout, type CreatorRevenueEvent, type CreatorWallet } from '@/lib/creatorWallet'
import styles from '@/components/creator/creatorWallet.module.css'

const WalletEmbed = dynamic(() => import('@/components/creator/CreatorWalletEmbed').then(module => module.CreatorWalletEmbed), { ssr: false, loading: () => <div className={styles.embedState} role="status"><Loader2 className="animate-spin" size={22}/> Loading secure form…</div> })
const money = (amount: number | string | null | undefined, currency: string) => amount == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount))
const day = (date: string) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const statuses: Record<string, string> = { requested: 'Requested', in_review: 'In review', processing: 'Processing', completed: 'Completed', reversed: 'Reversed', canceled: 'Canceled', failed: 'Failed', denied: 'Denied' }
const Status = ({ status }: { status: string }) => <span className={styles.status} data-status={status}>{status === 'completed' && <Check size={10}/>} {statuses[status] || status}</span>
async function fetchWallet(signal?: AbortSignal): Promise<CreatorWallet> {
  const response = await fetch('/api/creator/wallet', { cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(35_000)]) : AbortSignal.timeout(35_000) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Your balance could not be loaded.')
  return data
}

export function PayoutSetupClient({ profile, recentPayouts, revenueAvailable = true, revenueLimited = false, isTestAccount = false, now }: { profile: { connected: boolean }; recentPayouts: CreatorRevenueEvent[]; revenueAvailable?: boolean; revenueLimited?: boolean; isTestAccount?: boolean; now: number }) {
  const [wallet, setWallet] = useState<CreatorWallet | null>(null)
  const [loading, setLoading] = useState(profile.connected)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')
  const [moreError, setMoreError] = useState('')
  const [selectedCurrency, setCurrency] = useState('')
  const [period, setPeriod] = useState<30 | 90>(30)
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [intent, setIntent] = useState<'withdraw' | 'verification' | null>(null)
  const [detail, setDetail] = useState<CreatorPayout | null>(null)
  const gradientId = useId().replaceAll(':', '')
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await fetchWallet(signal)
      if (!signal?.aborted) { setWallet(data); setError(''); setMoreError('') }
    } catch (cause) { if (!signal?.aborted) { setWallet(null); setError(cause instanceof Error ? cause.message : 'Please try again.') } }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [])
  useEffect(() => {
    if (!profile.connected) return
    const controller = new AbortController()
    void fetchWallet(controller.signal).then(data => {
      if (!controller.signal.aborted) { setWallet(data); setError(''); setLoading(false) }
    }).catch(cause => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Please try again.'); setLoading(false) } })
    const visible = () => { if (document.visibilityState === 'visible') { setLoading(true); void refresh(controller.signal) } }
    document.addEventListener('visibilitychange', visible)
    return () => { controller.abort(); document.removeEventListener('visibilitychange', visible) }
  }, [profile.connected, refresh])
  async function loadMore() {
    if (!wallet?.nextCursor || loading || more) return
    setMore(true); setMoreError('')
    try {
      const response = await fetch('/api/creator/wallet?after=' + encodeURIComponent(wallet.nextCursor), { cache: 'no-store', signal: AbortSignal.timeout(35_000) })
      const data: CreatorWallet & { error?: string } = await response.json()
      if (!response.ok || data.historyError || !data.payouts) throw new Error(data.error || 'More payouts could not be loaded. Try again.')
      setWallet(previous => previous ? { ...previous, payouts: [...new Map([...(previous.payouts || []), ...data.payouts!].map(row => [row.id, row])).values()], nextCursor: data.nextCursor } : previous)
    } catch (cause) { setMoreError(cause instanceof Error ? cause.message : 'Please try again.') }
    finally { setMore(false) }
  }
  const currencies = [...new Set([...(wallet?.balances?.map(row => row.currency) || []), ...recentPayouts.map(row => row.currency?.toLowerCase()).filter((value): value is string => !!value && /^[a-z]{3}$/.test(value)), ...(wallet?.payouts?.map(row => row.currency) || [])])].sort()
  const currency = selectedCurrency || wallet?.balances?.[0]?.currency || currencies[0] || 'usd'
  const balance = wallet?.balances?.find(row => row.currency === currency)
  const revenue = creatorRevenue(recentPayouts, currency, period, now)
  const maximum = Math.max(...revenue.points.map(point => point.amount), 1)
  const coordinates = revenue.points.map((point, index) => `${(index / (revenue.points.length - 1) * 960).toFixed(2)},${(145 - point.amount / maximum * 125).toFixed(2)}`)
  const line = 'M ' + coordinates.join(' L ')
  const rows = (wallet?.payouts || []).filter(row => row.currency === currency && (status === 'all' || row.status === status) && (row.id.toLowerCase().includes(search.toLowerCase()) || day(row.createdAt).toLowerCase().includes(search.toLowerCase())))
  function reload() { setLoading(true); void refresh() }
  function closeSecure() { setIntent(null); setLoading(true); void refresh() }

  return <div className={styles.page}>
    <header className={styles.heading}><div><h1>Balance & payouts</h1><p>Balances, revenue and transfers.</p></div>{profile.connected && <div className={styles.actions}><button className={styles.secondary} onClick={reload} disabled={loading || more} aria-label="Refresh balance and payouts"><RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Refresh</button><button className={styles.primary} onClick={() => setIntent('withdraw')} disabled={isTestAccount || !wallet?.canPayout || wallet.balanceError || loading}><ArrowUpRight size={16}/> Withdraw</button></div>}</header>
    {!profile.connected ? <section className={styles.panel}><div className={styles.empty}><WalletCards size={32}/><h2>A home for your earnings</h2><p>Set up payments to track your balance and receive payouts here.</p><Link href="/creators/studio?section=settings" className={styles.primary}>Set up payments <ArrowRight size={15}/></Link></div></section> : <>
      <div className={styles.toolbar}><span className={styles.checked} role="status">{loading ? <Loader2 size={12} className="animate-spin"/> : <ShieldCheck size={13}/>} {loading ? 'Checking your account…' : wallet ? 'Updated ' + new Date(wallet.checkedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Account not loaded'}</span><label className={styles.currency}>Currency<select value={currency} onChange={event => setCurrency(event.target.value)}>{(currencies.length ? currencies : ['usd']).map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label></div>
      {error && <div className={styles.notice} data-error role="alert"><Info size={17}/><span>{error}</span><button className={styles.quiet} onClick={reload} disabled={loading}>Try again <ArrowRight size={14}/></button></div>}
      {wallet?.state !== 'ready' && wallet && <div className={styles.notice}><Info size={17}/><span>{wallet.state === 'restricted' ? 'Your payment account is restricted. Check verification for required information.' : 'Your account setup is still in progress.'}</span><button className={styles.secondary} disabled={isTestAccount} onClick={() => setIntent('verification')}>Review verification <ArrowRight size={14}/></button></div>}
      {wallet?.state === 'ready' && !wallet.canPayout && <div className={styles.notice}><Info size={17}/><span>Payments are enabled. Payouts need additional verification.</span><button className={styles.secondary} disabled={isTestAccount} onClick={() => setIntent('verification')}>Complete verification <ArrowRight size={14}/></button></div>}
      {isTestAccount && <p className={styles.notice}>Test workspace. Financial actions are disabled.</p>}
      <section className={styles.stats} aria-label="Account balances">
        <article className={styles.stat}><span><WalletCards size={16}/> Available balance</span><strong>{money(balance?.available, currency)}</strong><p>{wallet?.balanceError ? 'Balance unavailable. Refresh to try again.' : balance ? 'Settled funds · payout limits apply' : loading ? 'Loading your balance…' : 'No balance reported in this currency'}</p></article>
        <article className={styles.stat}><span><Clock3 size={16}/> Pending</span><strong>{money(balance?.pending, currency)}</strong><p>Payments awaiting settlement</p></article>
        <article className={styles.stat}><span><LockKeyhole size={16}/> In reserve</span><strong>{money(balance?.reserved, currency)}</strong><p>Funds held by the payment provider</p></article>
      </section>
    </>}
    <section className={styles.panel} aria-labelledby="creator-revenue-title"><header className={styles.panelHeader}><div><h2 id="creator-revenue-title">Revenue</h2><p>Gross sales · before fees and refunds</p></div><div className={styles.segments} aria-label="Revenue period">{([30, 90] as const).map(days => <button key={days} aria-pressed={days === period} onClick={() => setPeriod(days)}>{days} days</button>)}</div></header>
      <div className={styles.revenueTotal}><strong>{revenueAvailable ? money(revenue.total, currency) : '—'}</strong><span>{revenueAvailable ? `${revenue.count} ${revenue.count === 1 ? 'payment' : 'payments'}` : 'Revenue records could not be loaded'}</span></div>
      {revenueAvailable && <><figure className={styles.chart}><svg viewBox="0 0 960 160" preserveAspectRatio="none" role="img" aria-label={`${period}-day gross revenue: ${money(revenue.total, currency)}`}><defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity=".20"/><stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs>{[20, 82, 145].map(y => <line key={y} x1="0" x2="960" y1={y} y2={y}/>)}<path d={line + ' L 960,160 L 0,160 Z'} fill={`url(#${gradientId})`}/><path d={line} data-line="true"/>{revenue.points.map((point, index) => <circle key={point.date} cx={index / (revenue.points.length - 1) * 960} cy={145 - point.amount / maximum * 125} r={point.amount > 0 ? 3 : 0}><title>{day(point.date)} · {money(point.amount, currency)}</title></circle>)}</svg><figcaption className={styles.chartLabels}><span>{day(revenue.points[0].date)}</span><span>{day(revenue.points[Math.floor(period / 2)].date)}</span><span>{day(revenue.points.at(-1)!.date)}</span></figcaption></figure><details className={styles.daily}><summary>Daily breakdown</summary><div>{revenue.points.map(point => <p key={point.date}><span>{day(point.date)}</span><strong>{money(point.amount, currency)}</strong></p>)}</div></details></>}
      <footer className={styles.chartFooter}><span>{revenueLimited ? 'Based on the latest 1,000 recorded payments and events.' : 'Recorded payments · UTC dates'}{!revenueAvailable && ' · Refresh the page to retry'}</span><Link href="/creators/studio?section=analytics">View analytics <ArrowUpRight size={13}/></Link></footer>
    </section>
    {profile.connected && <section className={styles.panel} aria-labelledby="creator-payout-history"><header className={styles.panelHeader}><div><h2 id="creator-payout-history">Payout history</h2><p>Track transfers from your balance.</p></div><ArrowDownLeft size={18}/></header><div className={styles.filters}><label className={styles.search}><Search size={15}/><input aria-label="Search loaded payouts" placeholder="Find a payout…" value={search} onChange={event => setSearch(event.target.value)}/></label><select aria-label="Filter payout status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      {loading ? <div className={styles.empty} role="status">Loading payouts…</div> : wallet?.historyError || !wallet ? <div className={styles.empty}>Payout history is unavailable. Refresh to try again.</div> : rows.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">Payout</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Arrival</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><button onClick={() => setDetail(row)} aria-label={'View payout ' + row.id}><ArrowUpRight size={16}/><span>{day(row.createdAt)}<small>…{row.id.slice(-7)}</small></span><ChevronRight size={12}/></button></td><td>{money(row.amount, row.currency)}</td><td><Status status={row.status}/></td><td>{row.arrival ? day(row.arrival) : '—'}</td></tr>)}</tbody></table></div> : <div className={styles.empty}>{search || status !== 'all' || wallet.nextCursor ? 'No matching payouts on the loaded pages.' : 'Your payouts will appear here once a transfer is requested.'}</div>}
      {moreError && <p className={styles.notice} data-error role="alert">{moreError}</p>}{wallet?.nextCursor && <footer className={styles.historyFooter}><button className={styles.quiet} disabled={more || loading} onClick={loadMore}>{more ? <Loader2 className="animate-spin" size={14}/> : null} Load more payouts</button></footer>}
    </section>}
    <footer className={styles.pageFooter}><span>Financial services and account fees are managed by Whop.</span>{profile.connected && <button className={styles.quiet} disabled={isTestAccount} onClick={() => setIntent('verification')}><ShieldCheck size={14}/> Verification</button>}</footer>
    {intent && <CreatorDialog title={intent === 'withdraw' ? 'Withdraw funds' : 'Account verification'} description={intent === 'withdraw' ? 'Choose a destination and review the amount and fees before confirming.' : 'Complete the required checks securely without leaving SlipSurge.'} onClose={closeSecure}><WalletEmbed intent={intent} currency={currency} onChanged={reload} onVerify={() => setIntent('verification')}/></CreatorDialog>}
    {detail && <CreatorDialog narrow title="Payout details" description={detail.id} onClose={() => setDetail(null)}><dl className={styles.details}><div><dt>Status</dt><dd><Status status={detail.status}/></dd></div><div><dt>Requested</dt><dd>{new Date(detail.createdAt).toLocaleString()}</dd></div><div><dt>Amount</dt><dd>{money(detail.amount, detail.currency)}</dd></div><div><dt>Payout fee</dt><dd>{money(detail.fee, detail.currency)}</dd></div><div><dt>Provider markup</dt><dd>{money(detail.markup, detail.currency)}</dd></div><div><dt>Fees paid by</dt><dd>{detail.feePaidBy === 'self' ? 'Your balance' : detail.feePaidBy === 'platform' ? 'Platform' : '—'}</dd></div><div><dt>{detail.status === 'completed' ? 'Net payout' : 'Planned net'}</dt><dd>{money(detail.net, detail.currency)}</dd></div>{detail.arrival && <div><dt>Estimated arrival</dt><dd>{new Date(detail.arrival).toLocaleString()}</dd></div>}</dl><p className={styles.detailNote}>Amounts are in {detail.currency.toUpperCase()}.{['failed', 'denied', 'canceled', 'reversed'].includes(detail.status) ? ' This payout did not complete successfully. A planned net amount does not confirm money was delivered.' : ' Arrival estimates can change. Your bank determines when funds become available.'}</p></CreatorDialog>}
  </div>
}
