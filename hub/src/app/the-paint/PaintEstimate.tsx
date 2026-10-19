'use client'
import { useEffect,useState } from 'react'
import { nbaBinary,nbaMarketLogs,type PaintPlayer,type PaintMarket } from '@/lib/nbaPaint'
import { nbaValidatedEstimate,type NbaModelReport } from '@/lib/nbaModel'
import { number } from './PaintVisuals'
import styles from './paint.module.css'
export function PaintEstimate({player,market,before}:{player:PaintPlayer;market:PaintMarket;before:string}){
 const [reports,setReports]=useState<NbaModelReport[]|null>(null),[failed,setFailed]=useState(false)
 useEffect(()=>{const controller=new AbortController();fetch('/the-paint/models',{cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])}).then(async response=>{if(!response.ok)throw new Error('unavailable');return response.json()}).then(data=>{if(!controller.signal.aborted)setReports(data.reports)}).catch(()=>{if(!controller.signal.aborted)setFailed(true)});return()=>controller.abort()},[])
 const report=reports?.find(report=>report.market===market&&report.validationThrough<before),estimate=nbaValidatedEstimate(nbaMarketLogs(player,market),market,before,report),binary=nbaBinary(market)
 return <div className={styles.estimateCard}><span><small>VALIDATED ROLLING BASELINE</small><strong>{estimate==null?'—':binary?(estimate*100).toFixed(1)+'% frequency':number(estimate)}</strong></span><div>{estimate==null?<small>{failed?'Validation unavailable':reports==null?'Loading validation…':'Not enough validated history for this sample'}</small>:<><b>Holdout {binary?'Brier':'MAE'} {number(binary?report?.validationBrier:report?.validationMae,binary?4:2)}</b><small>{report!.validationGames.toLocaleString()} later observations · {report!.method==='last10'?'Last ten':Math.round(report!.recentWeight!*100)+'% L5 / '+Math.round((1-report!.recentWeight!)*100)+'% prior 15'}</small><small>{binary?'Rolling event frequency; no calibration claim':'Expected production baseline; not a hit probability'}</small></>}</div></div>
}
