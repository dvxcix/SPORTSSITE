export function installReviewNetworkGuard(){
 const original=globalThis.fetch
 if((original as typeof original & {reviewGuard?:boolean}).reviewGuard)return
 const guarded:typeof fetch=async(input,init)=>{
  const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url
  const url=new URL(raw,'http://127.0.0.1')
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('Design review blocks external server requests: '+url.hostname+url.pathname)
  return original(input,init)
 }
 ;(guarded as typeof guarded & {reviewGuard?:boolean}).reviewGuard=true
 globalThis.fetch=guarded
}
