import Link from 'next/link'
import { redirect } from 'next/navigation'
import { creatorAdminAuth } from '@/lib/creatorAdminAuth'
import { getCreatorOperations } from '@/lib/creatorOperations'
import { CreatorOperationsConsole } from '@/components/admin/CreatorOperationsConsole'
import { AdminCreatorActions } from '@/components/admin/AdminCreatorActions'
import { SafeImage } from '@/components/ui/SafeImage'
import styles from './AdminCreators.module.css'

export const dynamic='force-dynamic'
type LegacyApplication={id:string;user_id:string;status:string;why_creator:string;applicant:{username:string;display_name:string|null;avatar_url:string|null}|null}
export default async function AdminCreatorsPage() {
  const auth=await creatorAdminAuth()
  if('error' in auth) redirect(auth.status===401?'/auth/login':'/settings/security')
  const [data,applications,setting]=await Promise.all([
    getCreatorOperations(auth.admin),
    auth.admin.from('creator_applications').select('id,user_id,status,why_creator,applicant:users!creator_applications_user_id_fkey(username,display_name,avatar_url)').order('created_at',{ascending:false}).limit(200),
    auth.admin.from('platform_settings').select('value').eq('key','fee_independent_creator_pct').maybeSingle(),
  ])
  if(applications.error) throw new Error('Legacy applications could not be loaded.')
  const apps=(applications.data??[]) as unknown as LegacyApplication[]
  const pending=apps.filter(app=>app.status==='pending')
  return <div className={styles.page}>
    <header className={styles.hero}><div><h1>Creator operations</h1><p>Manage community owners, offers and member access.</p></div><nav className={styles.quickLinks} aria-label="Business controls"><Link href="/admin/monetization">Platform fee{typeof setting.data?.value==='number'?` · ${setting.data.value}%`:''}</Link><Link href="/admin/groups">Communities</Link><Link href="/admin/users">Members</Link><Link href="/admin/audit">Audit log</Link><Link href="/creators">Marketplace</Link></nav></header>
    <CreatorOperationsConsole data={data}/>
    <details className={styles.legacy}><summary>Legacy applications · {pending.length} pending</summary><p>Paid setup is self-service. These applications are retained from the earlier approval process.</p><div className={styles.applicationGrid}>{apps.map(app=><article key={app.id} className={styles.application}><div className={styles.person}><span><SafeImage src={app.applicant?.avatar_url} alt="" fallback={(app.applicant?.display_name||app.applicant?.username||'?')[0]}/></span><div><strong>{app.applicant?.display_name||app.applicant?.username||'Member'}</strong><small>@{app.applicant?.username} · {app.status}</small></div></div><p>{app.why_creator}</p>{app.status==='pending'&&<AdminCreatorActions applicationId={app.id} userId={app.user_id}/>}</article>)}{!apps.length&&<p className={styles.empty}>No legacy applications.</p>}</div></details>
  </div>
}
