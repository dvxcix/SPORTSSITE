/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BadgeDollarSign, CheckCircle, Clock, ExternalLink, Layers3, ShieldCheck, Users, WalletCards } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminCreatorActions } from '@/components/admin/AdminCreatorActions'
import { CreatorManagementActions } from '@/components/admin/CreatorManagementActions'
import styles from './AdminCreators.module.css'

export const dynamic = 'force-dynamic'
const activeStatuses = ['active', 'trialing']

export default async function AdminCreatorsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: me } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (me?.account_type !== 'admin') redirect('/feed')
  const admin = createAdminClient()
  const [{ data: applications }, { data: creators }, { data: products }, { data: entitlements }, { data: events }] = await Promise.all([
    admin.from('creator_applications').select('*, applicant:users!creator_applications_user_id_fkey(id,username,display_name,avatar_url,email,follower_count)').order('created_at', { ascending: false }),
    admin.from('users').select('id,username,display_name,avatar_url,email,creator_commerce_status,creator_commerce_updated_at,whop_connected_company_id').eq('account_type', 'creator').order('display_name'),
    admin.from('creator_products').select('id,creator_id,title,price,currency,product_type,status,purchase_url,updated_at').order('updated_at', { ascending: false }),
    admin.from('creator_entitlements').select('id,creator_id,product_id,user_id,status,current_period_end,created_at,member:users!creator_entitlements_user_id_fkey(username,display_name,email)').order('created_at', { ascending: false }),
    admin.from('creator_commerce_events').select('id,creator_id,product_id,event_type,amount,currency,status,created_at').order('created_at', { ascending: false }).limit(100),
  ])
  const apps = applications ?? []; const creatorRows = creators ?? []; const offers = products ?? []; const members = entitlements ?? []; const activity = events ?? []
  const pending = apps.filter((item: any) => item.status === 'pending')
  const gmv = activity.filter(item => item.amount && item.status !== 'failed').reduce((sum, item) => sum + Number(item.amount), 0)

  return <div className={styles.page}>
    <section className={styles.hero}><div><span><ShieldCheck size={14} /> CREATOR OPERATIONS</span><h1>Creator Control Center</h1><p>One operational view for applications, connected accounts, memberships, access, revenue, and payout readiness.</p></div><Link href="/creators">View marketplace <ExternalLink size={14} /></Link></section>
    <div className={styles.stats}>{[
      ['Pending', pending.length, Clock], ['Creators', creatorRows.length, CheckCircle], ['Connected', creatorRows.filter(row => row.whop_connected_company_id).length, WalletCards], ['Live offers', offers.filter(row => row.status === 'active').length, Layers3], ['Active members', members.filter(row => activeStatuses.includes(row.status)).length, Users], ['Recorded GMV', `$${gmv.toFixed(2)}`, BadgeDollarSign],
    ].map(([label, value, Icon]: any) => <div className={styles.stat} key={label}><Icon size={19} /><div><strong>{value}</strong><span>{label}</span></div></div>)}</div>

    <section className={styles.section}><header><div><span>OPERATIONS</span><h2>Creator roster</h2></div><p>Connection, offer, member, and revenue health at a glance.</p></header><div className={styles.tableWrap}><table><thead><tr><th>Creator</th><th>Whop / payouts</th><th>Offers</th><th>Members</th><th>Recorded GMV</th><th>Last activity</th></tr></thead><tbody>{creatorRows.map(creator => {
      const creatorOffers = offers.filter(item => item.creator_id === creator.id); const creatorMembers = members.filter(item => item.creator_id === creator.id && activeStatuses.includes(item.status)); const creatorEvents = activity.filter(item => item.creator_id === creator.id); const creatorGmv = creatorEvents.filter(item => item.amount && item.status !== 'failed').reduce((sum, item) => sum + Number(item.amount), 0)
      return <tr key={creator.id}><td><div className={styles.person}><span>{creator.avatar_url ? <img src={creator.avatar_url} alt="" /> : (creator.display_name || creator.username || '?')[0]}</span><div><strong>{creator.display_name || creator.username}</strong><small>@{creator.username} · {creator.email}</small></div></div></td><td><b className={creator.whop_connected_company_id ? styles.ready : styles.attention}>{creator.whop_connected_company_id ? 'Connected' : 'Setup required'}</b><small className={styles.mono}>{creator.whop_connected_company_id || creator.creator_commerce_status}</small></td><td>{creatorOffers.filter(item => item.status === 'active').length} live / {creatorOffers.length} total</td><td>{creatorMembers.length}</td><td>${creatorGmv.toFixed(2)}</td><td>{creatorEvents[0] ? new Date(creatorEvents[0].created_at).toLocaleString() : 'No activity'}</td></tr>
    })}</tbody></table></div></section>

    <section className={styles.section}><header><div><span>MEMBERSHIPS</span><h2>Offer controls</h2></div><p>Pause a listing immediately without deleting its history.</p></header><div className={styles.rows}>{offers.map(offer => { const owner = creatorRows.find(item => item.id === offer.creator_id); return <div className={styles.row} key={offer.id}><div><strong>{offer.title}</strong><span>{owner?.display_name || owner?.username} · ${Number(offer.price).toFixed(2)} {offer.product_type === 'membership' ? 'monthly' : 'one time'}</span></div><b data-status={offer.status}>{offer.status}</b><CreatorManagementActions kind="product" id={offer.id} status={offer.status} /></div>})}{!offers.length && <p className={styles.empty}>No creator offers yet.</p>}</div></section>

    <section className={styles.section}><header><div><span>ACCESS</span><h2>Recent memberships</h2></div><p>Inspect member state and revoke access when required.</p></header><div className={styles.rows}>{members.slice(0, 30).map((member: any) => { const owner = creatorRows.find(item => item.id === member.creator_id); const offer = offers.find(item => item.id === member.product_id); return <div className={styles.row} key={member.id}><div><strong>{member.member?.display_name || member.member?.username || member.member?.email || 'Member'}</strong><span>{offer?.title || 'Creator offer'} by {owner?.display_name || owner?.username}</span></div><b data-status={member.status}>{member.status}</b><CreatorManagementActions kind="entitlement" id={member.id} status={member.status} /></div>})}{!members.length && <p className={styles.empty}>No memberships yet.</p>}</div></section>

    <section className={styles.section}><header><div><span>PAYMENTS</span><h2>Commerce and payout monitoring</h2></div><p>Direct-charge earnings are held in each creator’s connected Whop account. Creators complete verification and withdraw from their secure payout portal.</p></header><div className={styles.rows}>{activity.slice(0, 30).map(event => { const owner = creatorRows.find(item => item.id === event.creator_id); return <div className={styles.row} key={event.id}><div><strong>{String(event.event_type).replaceAll('_', ' ')}</strong><span>{owner?.display_name || owner?.username || 'Unknown creator'} · {new Date(event.created_at).toLocaleString()}</span></div><b data-status={event.status || 'recorded'}>{event.status || 'recorded'}</b><strong>{event.amount == null ? 'Recorded' : `${String(event.currency || 'usd').toUpperCase()} ${Number(event.amount).toFixed(2)}`}</strong></div>})}{!activity.length && <p className={styles.empty}>No commerce activity yet.</p>}</div></section>

    <section className={styles.section}><header><div><span>APPLICATIONS</span><h2>Creator approvals</h2></div><p>{pending.length} awaiting review · {apps.filter((item: any) => item.status === 'approved').length} approved · {apps.filter((item: any) => item.status === 'rejected').length} rejected</p></header><div className={styles.applicationGrid}>{pending.map((app: any) => <article key={app.id} className={styles.application}><div className={styles.person}><span>{app.applicant?.avatar_url ? <img src={app.applicant.avatar_url} alt="" /> : (app.applicant?.display_name || app.applicant?.username || '?')[0]}</span><div><strong>{app.applicant?.display_name || app.applicant?.username}</strong><small>@{app.applicant?.username}</small></div></div><p>{app.why_creator}</p><AdminCreatorActions applicationId={app.id} userId={app.user_id} /></article>)}{!pending.length && <p className={styles.empty}>No pending applications.</p>}</div></section>
  </div>
}
