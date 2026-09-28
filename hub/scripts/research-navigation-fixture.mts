// Local component verification only. No production auth, accounts or database.
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const stubs: Record<string,string> = {
  'next/navigation': 'import {useSyncExternalStore} from "react";const sub=fn=>{addEventListener("popstate",fn);return()=>removeEventListener("popstate",fn)};export const usePathname=()=>useSyncExternalStore(sub,()=>location.pathname);export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(sub,()=>location.search));export const useRouter=()=>({push(url){history.pushState({}, "",url);dispatchEvent(new PopStateEvent("popstate"))},back(){history.back()}})',
  'next/link': 'export default function Link({href,prefetch,scroll,children,...props}){return <a href={href} {...props} onClick={e=>{props.onClick?.(e);if(!e.defaultPrevented){e.preventDefault();history.pushState({},"",href);dispatchEvent(new PopStateEvent("popstate"))}}}>{children}</a>}',
  'next/image': 'export default function Image({priority,unoptimized,fill,...props}){return <img {...props}/>}',
  '@/lib/featureFlags': 'export const fetchFeatureFlagsClient=async()=>({feature_pages:false,feature_events:false,feature_blog:false})',
  '@/context/AuthContext': 'export const useAuth=()=>({profile:{tier:"ultimate",account_type:"user",username:"tester"},user:{id:"fixture"}})',
  '@/lib/useNflAccess': 'export const useNflAccess=()=>({allowed:new URLSearchParams(location.search).get("access")!=="no"})',
}
const team = {abbr:'GB',name:'Green Bay Packers',color:'#203731',logo:null}
const game = {id:'2026_03_ATL_GB',season:2026,week:3,gameType:'REG',gameday:'2026-09-24',gametime:'20:15',away:{...team,abbr:'ATL',name:'Atlanta Falcons'},home:team}
const entry = `
import {useState} from 'react';import {createRoot} from 'react-dom/client';import {usePathname,useSearchParams} from 'next/navigation';
import {Sidebar} from './src/components/layout/Sidebar';import {MobileDock} from './src/components/layout/MobileDock';import {SidelineNavigation} from './src/app/the-sideline/SidelineNavigation';
function App(){const [open,setOpen]=useState(false);const path=usePathname(),search=useSearchParams();return <div style={{display:'flex'}}><Sidebar open={open} onClose={()=>setOpen(false)}/><main style={{flex:1,minWidth:0}}><button id="open-menu" onClick={()=>setOpen(true)}>Open menu</button><SidelineNavigation selected={${JSON.stringify(game)}} games={[${JSON.stringify(game)}]} days={[{date:'2026-09-24',season:2026,week:3,gameType:'REG'}]} sample="regular" mode={search.get('mode')??''}/><p>{path}</p></main><MobileDock onMenuClick={()=>setOpen(true)}/></div>}createRoot(document.getElementById('root')).render(<App/>);`
const bundled=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outdir:'.artifacts/navigation',platform:'browser',format:'iife',jsx:'automatic',tsconfig:'tsconfig.json',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^(next\/(navigation|link|image)|@\/lib\/(featureFlags|useNflAccess)|@\/context\/AuthContext)$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:process.cwd()}))}}]})
const css=await postcss([tailwind()]).process(readFileSync('src/app/globals.css','utf8'),{from:resolve('src/app/globals.css')})
const js=bundled.outputFiles.find(f=>f.path.endsWith('.js'))!.text
const styles=css.css+'\n'+bundled.outputFiles.find(f=>f.path.endsWith('.css'))!.text
createServer((req,res)=>{
  const path=new URL(req.url??'/','http://localhost').pathname
  if(path==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return}
  if(path==='/app.css'){res.setHeader('Content-Type','text/css');res.end(styles);return}
  if(path==='/logo.png'){res.setHeader('Content-Type','image/png');res.end(readFileSync('public/logo.png'));return}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>')
}).listen(4189,'127.0.0.1',()=>console.log('Navigation fixture http://127.0.0.1:4189'))
