import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, globalAgent } from 'node:http'
import { requestNflCapture } from '../src/lib/nflCaptureRequest.ts'

test('capture transport waits for delayed headers and body within its explicit budget',async()=>{
 const server=createServer((req,res)=>{
  assert.equal(req.headers.authorization,'Bearer fixture')
  setTimeout(()=>{res.writeHead(200);res.write('{"ok":');setTimeout(()=>res.end('true}'),30)},30)
 })
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 try{const address=server.address() as {port:number};const result=await requestNflCapture(`http://127.0.0.1:${address.port}`,{authorization:'Bearer fixture'},1000);assert.equal(result.status,200);assert.deepEqual(await result.json(),{ok:true})}
 finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
})
test('capture transport aborts at its budget instead of leaving an unbounded request',async()=>{
 const server=createServer(()=>{})
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 try{const address=server.address() as {port:number};await assert.rejects(requestNflCapture(`http://127.0.0.1:${address.port}`,{},25),{name:'AbortError'})}
 finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
})

test('capture request overrides a shorter agent idle timeout',async()=>{
 const agent=globalAgent as typeof globalAgent & {options:{timeout?:number}}
 const prior=agent.options.timeout
 agent.options.timeout=10
 const server=createServer((_req,res)=>setTimeout(()=>res.end('{"ok":true}'),80))
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 try{const address=server.address() as {port:number};const response=await requestNflCapture(`http://127.0.0.1:${address.port}`,{},1000);assert.deepEqual(await response.json(),{ok:true})}
 finally{agent.options.timeout=prior;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
})
