'use client'
import { useEffect, useRef, useState } from 'react'
import styles from './audit.module.css'
type Item={id:string;label:string;group:string;href:string;role:string}
type Health={width:number;overflow:boolean;headings:string[];text:number;error:boolean;theme:string;loading:boolean;tables:number;dialogs:number;smallButtons:{label:string;width:number;height:number}[]}
const views=[{id:'desktop-light',width:1440,height:1000,theme:'light'},{id:'desktop-dark',width:1440,height:1000,theme:'dark'},{id:'phone-light',width:390,height:844,theme:'light'},{id:'phone-dark',width:390,height:844,theme:'dark'}]
export function FullAudit({items,initialId}:{items:Item[];initialId?:string}){
  const [id,setId]=useState(items.some(item=>item.id===initialId)?initialId!:items[0]?.id??''),[health,setHealth]=useState<Record<string,Health>>({})
  const frames=useRef<Record<string,HTMLIFrameElement|null>>({})
  const observers=useRef<Record<string,MutationObserver>>({})
  useEffect(()=>()=>Object.values(observers.current).forEach(observer=>observer.disconnect()),[])
  const item=items.find(row=>row.id===id)??items[0],index=items.indexOf(item)
  function measure(key:string){const win=frames.current[key]?.contentWindow,doc=win?.document;if(!win||!doc)return
    const root=doc.documentElement,text=doc.querySelector('main')?.textContent??doc.body.textContent??''
    const value={width:win.innerWidth,overflow:root.scrollWidth>win.innerWidth,headings:[...doc.querySelectorAll('main h1,main h2,main h3')].filter(el=>el.getClientRects().length>0).map(el=>el.textContent??''),text:text.trim().length,error:/Application error|Internal Server Error|This page could not be found|That page is not here/.test(text),theme:root.dataset.theme??'',loading:/^(?:Loading|Preparing)/.test(doc.querySelector('main h1')?.textContent??'')||text.trim().length<20,tables:doc.querySelectorAll('main table').length,dialogs:doc.querySelectorAll('[role=dialog]').length,smallButtons:[...doc.querySelectorAll('main button')].flatMap(el=>{const rect=el.getBoundingClientRect();return rect.width>0&&rect.height>0&&rect.height<(win.innerWidth<600?40:28)?[{label:el.getAttribute('aria-label')??el.textContent??'',width:Math.round(rect.width),height:Math.round(rect.height)}]:[]}).slice(0,12)}
    setHealth(prior=>({...prior,[key]:value}))
  }
  function loaded(view:typeof views[number]) {
    observers.current[view.id]?.disconnect()
    measure(view.id)
    const doc=frames.current[view.id]?.contentDocument
    if(!doc)return
    const settled=()=>doc.documentElement.dataset.appearanceReady==='true'&&doc.documentElement.dataset.theme===view.theme&&(doc.querySelector('main')?.textContent?.trim().length??0)>20
    if(settled())return
    const observer=new doc.defaultView!.MutationObserver(()=>{measure(view.id);if(settled())observer.disconnect()})
    observer.observe(doc.documentElement,{attributes:true,attributeFilter:['data-theme','data-appearance-ready'],childList:true,subtree:true})
    observers.current[view.id]=observer
  }
  function select(next:string){setHealth({});setId(next);window.history.replaceState(null,'','?surface='+encodeURIComponent(next))}
  return <div className={styles.audit}>
    <header><div><h1>Full-site inspection</h1><p>Actual pages · isolated fixtures · four layouts per surface</p></div><a href="/design-review/visual-audit">Checklist</a></header>
    <nav aria-label="Audit controls"><button onClick={()=>select(items[Math.max(0,index-1)].id)} disabled={index===0}>Previous</button><select aria-label="Audit surface" value={item.id} onChange={e=>select(e.target.value)}>{items.map(row=><option key={row.id} value={row.id}>{row.group} · {row.label}</option>)}</select><button onClick={()=>select(items[Math.min(items.length-1,index+1)].id)} disabled={index===items.length-1}>Next</button><button onClick={()=>views.forEach(view=>frames.current[view.id]?.contentWindow?.scrollBy({top:600,behavior:'instant'}))}>Next section</button><button onClick={()=>views.forEach(view=>frames.current[view.id]?.contentWindow?.scrollTo({top:0,behavior:'instant'}))}>Top</button><button onClick={()=>views.forEach(view=>measure(view.id))}>Check layout</button></nav>
    <p className={styles.caption}>{index+1} / {items.length} · <strong>{item.label}</strong> · {item.href}</p>
    <div className={styles.boards}>{views.map(view=>{const url=new URL(item.href,'http://127.0.0.1');url.searchParams.set('reviewRole',item.role);url.searchParams.set('reviewTheme',view.theme);url.searchParams.set('reviewMatrix','1');const result=health[view.id];return <section key={view.id} className={styles.preview} data-phone={view.width<500}><header><strong>{view.id}</strong><span>{view.width} × {view.height}</span><span role="status" data-failed={result?.error||result?.overflow}>{result?result.error?'Render error':result.loading?'Loading content':result.overflow?'Page overflow':result.theme!==view.theme?'Theme loading':'Contained':'Loading'}</span></header><div className={styles.canvas}><iframe key={item.id+view.id} ref={node=>{frames.current[view.id]=node}} title={view.id} data-review-theme={view.theme} data-review-matrix="true" src={url.pathname+url.search} width={view.width} height={view.height} onLoad={()=>loaded(view)}/></div></section>})}</div>
    <details><summary>Layout details</summary><pre aria-label="Layout results">{JSON.stringify(health,null,2)}</pre></details>
  </div>
}
