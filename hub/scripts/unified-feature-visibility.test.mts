import test from 'node:test'
import assert from 'node:assert/strict'
import { FEATURE_FLAGS, fetchFeatureFlagsClient } from '../src/lib/featureFlags'
import { isPublicFeatureRequest } from '../src/lib/publicBrowsePolicy'

test('failed availability reads do not advertise unfinished optional destinations',async()=>{
  const originalFetch=globalThis.fetch
  try{
    for(const scenario of ['http','network','json']){
      globalThis.fetch=(async()=>{
        if(scenario==='network')throw new Error('offline')
        return new Response('invalid response', { status: scenario==='http' ? 503 : 200 })
      }) as typeof fetch
      const flags=await fetchFeatureFlagsClient()
      for(const key of [FEATURE_FLAGS.blog,FEATURE_FLAGS.forum,FEATURE_FLAGS.pages,FEATURE_FLAGS.events])assert.equal(flags[key],false,`${scenario}: ${key}`)
      for(const key of [FEATURE_FLAGS.groups,FEATURE_FLAGS.polls,FEATURE_FLAGS.watchlist,FEATURE_FLAGS.stories])assert.equal(flags[key],true,`${scenario}: preserve ${key}`)
    }
  }finally{globalThis.fetch=originalFetch}
})

test('explicit server booleans remain authoritative and unknown fields stay out of navigation',async()=>{
  const originalFetch=globalThis.fetch
  try{
    globalThis.fetch=(async()=>new Response(JSON.stringify({flags:{feature_blog:true,feature_groups:false,internal_field:true}}),{headers:{'Content-Type':'application/json'}})) as typeof fetch
    const flags=await fetchFeatureFlagsClient()
    assert.equal(flags.feature_blog,true)
    assert.equal(flags.feature_groups,false)
    assert.equal('internal_field' in flags,false)
    assert.deepEqual(Object.keys(flags).sort(),Object.values(FEATURE_FLAGS).sort())
  }finally{globalThis.fetch=originalFetch}
})

test('public availability is an exact read-only endpoint, without opening mutations or admin routes',()=>{
  assert.equal(isPublicFeatureRequest('/api/features','GET'),true)
  assert.equal(isPublicFeatureRequest('/api/features','HEAD'),true)
  for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal(isPublicFeatureRequest('/api/features',method),false)
  for(const path of ['/api/features/admin','/api/admin/features','/api/feature-rollouts','/api/feed'])assert.equal(isPublicFeatureRequest(path,'GET'),false,path)
})
