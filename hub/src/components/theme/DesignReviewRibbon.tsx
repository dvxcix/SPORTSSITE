'use client'
import {usePathname} from 'next/navigation'
export function DesignReviewRibbon(){
 const path=usePathname()
 return <div className="ss-review-ribbon"><span><b>PRIVATE DESIGN REVIEW</b><small> · Actual app components · illustrative data · no live services</small></span><span className="flex items-center gap-3"><a href="/design-review">All screens</a><select aria-label="Review account" defaultValue="" onChange={event=>{if(event.target.value)window.location.assign(path+'?reviewRole='+event.target.value)}}><option value="" disabled>Review as…</option><option value="member">Ultimate member</option><option value="admin">Administrator</option><option value="guest">Signed out</option></select></span></div>
}
