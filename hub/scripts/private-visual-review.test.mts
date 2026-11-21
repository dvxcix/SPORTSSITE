import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const require=createRequire(import.meta.url)
for(const route of ['identity','decorations','visual-audit','full-audit'])test(`${route} is unavailable without the private build flag, before any local inventory is read`,async()=>{
  let reads=0,connections=0
  const bundle=await build({entryPoints:[`src/app/design-review/${route}/page.tsx`],absWorkingDir:resolve('.'),bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],plugins:[{name:'review-guard',setup(builder){
    builder.onResolve({filter:/^(next\/navigation|next\/server|node:fs\/promises|\.\/IdentityLab|\.\/DecorationsLab|\.\/ReviewChecklist|\.\/FullAudit)$/},args=>({path:args.path,namespace:'guard'}))
    builder.onLoad({filter:/.*/,namespace:'guard'},args=>({loader:'js',contents:args.path==='next/navigation'?'export function notFound(){throw new Error("PRIVATE_REVIEW_404")}':args.path==='next/server'?'export const connection=()=>__connection()':args.path==='node:fs/promises'?'export const readFile=()=>__readFile()':'export function IdentityLab(){return null}; export function DecorationsLab(){return null}; export function ReviewChecklist(){return null}; export function FullAudit(){return null}'}))
  }}]})
  const module={exports:{} as {default:(props?:unknown)=>unknown}}
  const props=route==='full-audit'?{searchParams:Promise.resolve({scope:'research'})}:undefined
  new Function('require','module','exports','__connection','__readFile',bundle.outputFiles[0].text)(require,module,module.exports,()=>{connections++},()=>{reads++;return '[]'})
  const previous=process.env.NEXT_PUBLIC_DESIGN_REVIEW
  try {
    process.env.NEXT_PUBLIC_DESIGN_REVIEW='0'
    await assert.rejects(async()=>module.exports.default(props),/PRIVATE_REVIEW_404/)
    assert.equal(reads,0);assert.equal(connections,0)
    process.env.NEXT_PUBLIC_DESIGN_REVIEW='1'
    assert.ok(await module.exports.default(props))
    assert.equal(reads,route==='visual-audit'?1:0)
  } finally {if(previous===undefined)delete process.env.NEXT_PUBLIC_DESIGN_REVIEW;else process.env.NEXT_PUBLIC_DESIGN_REVIEW=previous}
})
