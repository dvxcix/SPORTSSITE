export function installReviewNetworkGuard(){
 const original=globalThis.fetch
 if((original as typeof original & {reviewGuard?:boolean}).reviewGuard)return
 const guarded:typeof fetch=async(input,init)=>{
  const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url
  const url=new URL(raw,'http://127.0.0.1')
  // Deterministic off-season team-page fixtures, without contacting MLB.
  if(url.hostname==='statsapi.mlb.com'&&url.pathname==='/api/v1/teams/147')return Response.json({teams:[{id:147,name:'New York Yankees',abbreviation:'NYY',locationName:'New York',venue:{name:'Yankee Stadium'},league:{name:'American League'},division:{name:'American League East'}}]})
  if(url.hostname==='statsapi.mlb.com'&&url.pathname==='/api/v1/teams/147/roster')return Response.json({roster:[{person:{id:592450,fullName:'Aaron Judge'},jerseyNumber:'99',position:{name:'Right Fielder',abbreviation:'RF',type:'Outfielder'},status:{description:'Active'}}]})
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('Design review blocks external server requests: '+url.hostname+url.pathname)
  return original(input,init)
 }
 ;(guarded as typeof guarded & {reviewGuard?:boolean}).reviewGuard=true
 globalThis.fetch=guarded
}
