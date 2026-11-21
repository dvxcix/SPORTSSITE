import { notFound } from 'next/navigation'
import { FullAudit } from './FullAudit'
import catalog from '../../../../review/catalog.json'
import inventory from '../visual-audit/inventory.json'
import memberSurfaces from '../../../../review/member-surfaces.json'

export default async function FullAuditPage({searchParams}:{searchParams:Promise<{surface?:string;scope?:string}>}) {
  if (process.env.NEXT_PUBLIC_DESIGN_REVIEW !== '1') notFound()
  const query=await searchParams
  if(query.scope==='members')return <FullAudit items={memberSurfaces} initialId={query.surface}/>
  const items=inventory.filter(row=>query.scope==='research'?row.group==='NBA'||row.group==='NFL':row.status==='Queued'||row.status==='In progress'||row.batch==='site-completion-2026-11-21').map(row=>{
    const page=catalog.find(item=>'source' in row&&item.source===row.source)
    let href=page?.href??row.route??(row.id.includes('NFL')?'/the-sideline':row.id.includes('NBA')?'/the-paint':'/feed')
    if(row.id==='shared:Player comparison')href='/the-paint'
    if(row.id==='shared:Confirmation dialogs')href='/workspace'
    if(href==='/nba')href='/the-paint'
    if(href==='/sports'||href==='/scores')href+='?date=2030-11-20'
    if(href.startsWith('/the-paint'))href+=(href.includes('?')?'&':'?')+'date=2030-11-20&game=900001'
    return {id:row.id,label:row.label,group:row.group,href,role:href==='/creators/studio'||href==='/creators/payouts'?'creator':row.group==='Admin'?'admin':href==='/'?'guest':row.group==='Account access'?(href==='/onboarding'?'onboarding':'guest'):'member'}
  })
  return <FullAudit items={items} initialId={query.surface}/>
}
