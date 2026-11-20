/** Compile the explicit local route catalog before interactive browser checks. */
import fs from 'node:fs/promises'
import path from 'node:path'
const root=path.resolve(import.meta.dirname,'..'),catalog=JSON.parse(await fs.readFile(path.join(root,'review/catalog.json'),'utf8'))
const start=Number(process.argv[2]??0),end=Number(process.argv[3]??catalog.length),concurrency=Number(process.argv[4]??9),results=[]
async function warm(i){
 const row=catalog[i],role=row.group==='Administration'?'admin':row.group==='Account entry'?'guest':'member',started=Date.now()
 try{const response=await fetch('http://127.0.0.1:4180'+row.href,{headers:{cookie:'ss_ui_review_role='+role},signal:AbortSignal.timeout(180000)});await response.arrayBuffer();results.push({index:i,path:row.href,status:response.status,ms:Date.now()-started});console.log(i+' '+response.status+' '+row.href)}catch(error){results.push({index:i,path:row.href,status:0,error:String(error)});console.log(i+' unavailable '+row.href)}
}
for(let offset=start;offset<end;offset+=concurrency){await Promise.allSettled(Array.from({length:Math.min(concurrency,end-offset)},(_,j)=>warm(offset+j)));await fs.writeFile(path.join(root,'docs/design/route-preflight.json'),JSON.stringify(results,null,2))}
