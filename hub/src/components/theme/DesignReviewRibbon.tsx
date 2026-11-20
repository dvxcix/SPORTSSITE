'use client'
import {DesignReviewMetrics} from './DesignReviewMetrics'
import {usePathname} from 'next/navigation'
export function DesignReviewRibbon(){
 const path=usePathname()
 return <><DesignReviewMetrics/><div className="ss-review-ribbon"><span><b>PRIVATE DESIGN REVIEW</b><small> · Actual app components · illustrative data · no live services</small></span><span className="flex items-center gap-3"><a href="/design-review">All screens</a><select aria-label="Review account" defaultValue="" onChange={event=>{if(!event.target.value)return;const destination=new URL(window.location.href);destination.pathname=path;destination.searchParams.set('reviewRole',event.target.value);window.location.assign(destination.href)}}><option value="" disabled>Review as…</option><option value="member">Ultimate member</option><option value="admin">Administrator</option><option value="guest">Signed out</option></select></span></div></>
}
