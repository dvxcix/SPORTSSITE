import test from 'node:test'
import assert from 'node:assert/strict'
import { isNativePublicRead, isPublicBrowsePath, isPublicBrowseRequest, usesVisitorBrowseFrame } from '../src/lib/publicBrowsePolicy'

test('visitors can read public discovery and public social detail pages',()=>{
  for(const path of ['/feed','/groups','/sports','/leaderboard','/explore','/profile/sports_member','/groups/community-room','/posts/00000000-0000-4000-8000-000000000301']){
    assert.equal(isPublicBrowsePath(path),true,path)
    assert.equal(isPublicBrowseRequest(path,'GET'),true,path)
    assert.equal(isPublicBrowseRequest(path,'HEAD'),true,path)
  }
})

test('discovery never opens account changes, APIs, nested management or paid research',()=>{
  for(const path of ['/messages','/channels','/settings','/admin','/admin/creators','/creators/studio','/creators/payouts','/groups/create','/groups/room/settings','/groups/room/invites','/profile/name/settings','/posts/create','/api/feed','/api/posts','/api/admin/users','/the-paint','/the-sideline','/nfl/players/123','/nba/players/123'])assert.equal(isPublicBrowseRequest(path,'GET'),false,path)
  for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS'])for(const path of ['/feed','/groups','/groups/community-room','/profile/member'])assert.equal(isPublicBrowseRequest(path,method),false,`${method} ${path}`)
})

test('encoded separators and appended route segments cannot expand the public policy',()=>{
  for(const path of ['/profile/a%2Fb','/groups/a%2Fsettings','/groups/room/settings/','/posts/00000000-0000-4000-8000-000000000301/edit','/feed/private','//groups','/api/groups/room','/profile/a?next=/admin'])assert.equal(isPublicBrowsePath(path),false,path)
})

test('existing public info pages share visitor navigation without opening protected workspaces',()=>{
  for(const path of ['/about','/faq','/pricing','/support','/terms','/privacy','/responsible-gambling','/feed','/profile/member'])assert.equal(usesVisitorBrowseFrame(path),true,path)
  for(const path of ['/messages','/admin','/settings','/creators/studio','/the-paint','/the-sideline'])assert.equal(usesVisitorBrowseFrame(path),false,path)
})

test('native information is an exact read-only guest route', () => {
  assert.equal(isNativePublicRead('/api/mobile/information', 'GET'), true)
  assert.equal(isNativePublicRead('/api/mobile/information', 'POST'), false)
  assert.equal(isNativePublicRead('/api/mobile/information/account', 'GET'), false)
})
