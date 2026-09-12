import { Activity, ArrowDownRight, ArrowUpRight, BadgeDollarSign, CircleDollarSign, Eye, MousePointerClick, Repeat2, ShieldCheck, UserMinus, UserPlus, Users } from 'lucide-react'
import styles from './CreatorAnalyticsDashboard.module.css'

export type CreatorAnalytics = {
  followers: number
  activeMembers: number
  trialingMembers: number
  atRiskMembers: number
  churned30: number
  retentionRate: number
  newMembers30: number
  memberGrowth: number
  revenue30: number
  revenueGrowth: number
  engagement30: number
  posts30: number
  funnel: { storefrontViews: number; offerViews: number; checkoutStarts: number; purchases: number }
  sources: Array<{ source: string; count: number }>
  offers: Array<{ id: string; title: string; views: number; checkouts: number; purchases: number; activeMembers: number; revenue: number }>
}

function Trend({ value, money = false }: { value: number; money?: boolean }) {
  const positive = value >= 0
  return <span className={positive ? styles.positive : styles.negative}>{positive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{money ? `$${Math.abs(value).toFixed(2)}` : Math.abs(value)} vs prior 30d</span>
}

export function CreatorAnalyticsDashboard({ analytics }: { analytics: CreatorAnalytics }) {
  const maxFunnel = Math.max(analytics.funnel.storefrontViews, 1)
  const funnel = [
    { label: 'Storefront', value: analytics.funnel.storefrontViews, icon: Eye },
    { label: 'Offer views', value: analytics.funnel.offerViews, icon: Activity },
    { label: 'Checkout', value: analytics.funnel.checkoutStarts, icon: MousePointerClick },
    { label: 'Purchases', value: analytics.funnel.purchases, icon: CircleDollarSign },
  ]

  return (
    <section className={styles.dashboard} aria-labelledby="creator-analytics-title">
      <header><div><span>PERFORMANCE</span><h2 id="creator-analytics-title">Creator analytics</h2><p>Last 30 days, compared with the previous 30.</p></div><Activity size={20} /></header>

      <div className={styles.kpis}>
        <article><span><UserPlus size={15} /></span><div><small>NEW MEMBERS</small><strong>{analytics.newMembers30}</strong><Trend value={analytics.memberGrowth} /></div></article>
        <article><span><BadgeDollarSign size={15} /></span><div><small>REVENUE</small><strong>${analytics.revenue30.toFixed(2)}</strong><Trend value={analytics.revenueGrowth} money /></div></article>
        <article><span><ShieldCheck size={15} /></span><div><small>RETENTION</small><strong>{analytics.retentionRate.toFixed(1)}%</strong><em>{analytics.churned30} lost · {analytics.atRiskMembers} at risk</em></div></article>
        <article><span><Repeat2 size={15} /></span><div><small>ENGAGEMENT</small><strong>{analytics.engagement30}</strong><em>Across {analytics.posts30} posts</em></div></article>
      </div>

      <div className={styles.analyticsGrid}>
        <article className={styles.funnelCard}>
          <header><div><small>AUDIENCE FUNNEL</small><strong>From discovery to access</strong></div><Users size={16} /></header>
          <div className={styles.funnel}>
            {funnel.map(({ label, value, icon: Icon }) => (
              <div key={label}><span><Icon size={12} /><b>{label}</b><strong>{value}</strong></span><i><span style={{ width: `${Math.max(value > 0 ? 4 : 0, Math.min(100, (value / maxFunnel) * 100))}%` }} /></i></div>
            ))}
          </div>
          <footer><span><b>{analytics.followers}</b> followers</span><span><b>{analytics.activeMembers}</b> active</span><span><b>{analytics.trialingMembers}</b> trialing</span></footer>
        </article>

        <article className={styles.sourceCard}>
          <header><div><small>DISCOVERY</small><strong>Audience sources</strong></div><Eye size={16} /></header>
          <div>{analytics.sources.length ? analytics.sources.slice(0, 6).map(source => <span key={source.source}><b>{source.source}</b><strong>{source.count}</strong></span>) : <p>Source data begins with new storefront visits.</p>}</div>
        </article>
      </div>

      <article className={styles.offerCard}>
        <header><div><small>OFFER PERFORMANCE</small><strong>Membership conversion</strong></div><CircleDollarSign size={16} /></header>
        {analytics.offers.length ? (
          <div className={styles.offerTable} role="table" aria-label="Offer performance over the last 30 days">
            <div className={styles.offerHead} role="row"><span role="columnheader">Offer</span><span role="columnheader">Views</span><span role="columnheader">Checkout</span><span role="columnheader">Purchased</span><span role="columnheader">Active</span><span role="columnheader">Revenue</span></div>
            {analytics.offers.map(offer => <div key={offer.id} className={styles.offerRow} role="row"><strong role="cell">{offer.title}</strong><span role="cell" data-label="Views">{offer.views}</span><span role="cell" data-label="Checkout">{offer.checkouts}</span><span role="cell" data-label="Purchased">{offer.purchases}</span><span role="cell" data-label="Active">{offer.activeMembers}</span><span role="cell" data-label="Revenue">${offer.revenue.toFixed(2)}</span></div>)}
          </div>
        ) : <div className={styles.empty}><UserMinus size={18} /> Publish an offer to begin tracking performance.</div>}
      </article>
    </section>
  )
}
