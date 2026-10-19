import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const state = { role: 'user', path: '/the-paint', nfl: true }
;(globalThis as typeof globalThis & { nbaNavFixture: typeof state }).nbaNavFixture = state
const stubs: Record<string,string> = {
  'next/navigation': `export const usePathname=()=>globalThis.nbaNavFixture.path;export const useSearchParams=()=>new URLSearchParams('view=public&game=123');export const useRouter=()=>({push(){},back(){}});`,
  'next/link': `import React from 'react';export default function Link({prefetch,children,...props}){return <a {...props}>{children}</a>}`,
  'next/image': `import React from 'react';export default function Image({priority,...props}){return <img {...props}/>}`,
  '@/components/ui/SafeImage': `import React from 'react';export function SafeImage({fallback,...props}){return <img {...props}/>}`,
  '@/components/social/MemberAvatar': `import React from 'react';export const MemberAvatar=()=> <span>Avatar</span>`,
  '@/context/AuthContext': `export const useAuth=()=>({profile:{account_type:globalThis.nbaNavFixture.role,tier:'ultimate',username:'tester'},loading:false})`,
  '@/lib/useNflAccess': `export const useNflAccess=()=>({allowed:globalThis.nbaNavFixture.nfl})`,
  '@/lib/useSidebarCollapsed': `export const useSidebarCollapsed=()=>({collapsed:false,toggle(){}})`,
  '@/lib/featureFlags': `export const fetchFeatureFlagsClient=async()=>({})`,
}
const bundled = await build({ stdin: { contents: `export {Sidebar} from './src/components/layout/Sidebar';export {DesktopNavigation} from './src/components/desktop/DesktopNavigation';export {DesktopCommandBar} from './src/components/layout/DesktopCommandBar';export {MobileDock} from './src/components/layout/MobileDock';export {MobileResearchPicker} from './src/components/layout/MobileResearchPicker';export {ResearchSportSwitcher} from './src/components/layout/ResearchSportSwitcher';`, resolveDir: resolve('.'), loader: 'tsx' }, bundle: true, write: false, outfile: 'navigation.cjs', platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react','react-dom'], tsconfig: 'tsconfig.json', loader: { '.css': 'empty' }, plugins: [{ name: 'auth-fixture', setup(builder) { builder.onResolve({filter: /^(next\/|@\/)/}, args => args.path in stubs ? {path:args.path,namespace:'stub'} : undefined);builder.onLoad({filter:/.*/,namespace:'stub'}, args=>({contents:stubs[args.path],loader:'tsx',resolveDir:resolve('.')})) } }] })
const compiled = {exports: {} as Record<string, React.ComponentType<Record<string, unknown>>>}
new Function('require','module','exports',bundled.outputFiles.find(file=>file.path.endsWith('.cjs'))!.text)(require,compiled,compiled.exports)
const noop = () => {}
const render = (name: string, props: Record<string,unknown> = {}) => renderToStaticMarkup(createElement(compiled.exports[name],props))

test('all navigation shells hide NBA from members even on a stored/current NBA route', () => {
  for (const role of ['user','creator','beta','']) {
    state.role = role
    for (const name of ['Sidebar','DesktopNavigation','DesktopCommandBar','MobileDock']) {
      const html=render(name,{open:true,onClose:noop,onMenuClick:noop})
      assert.doesNotMatch(html,/href="\/the-paint|leagues\/500\/nba\.png|NBA Research/,name+' '+role)
    }
  }
})

test('admin desktop and drawer shells expose NBA as a peer and mark the exact current tool', () => {
  state.role='admin'
  for (const name of ['Sidebar','DesktopNavigation']) {
    const html=render(name,{open:true,onClose:noop})
    assert.match(html,/href="\/the-paint/,name)
    assert.match(html,/leagues\/500\/nba\.png/,name)
    assert.equal((html.match(/aria-current="page"/g)??[]).length,1,name)
    assert.match(html,/view=public[^\"]*"[^>]*aria-current="page"/,name)
  }
  assert.match(render('MobileDock',{onMenuClick:noop}),/leagues\/500\/nba\.png/)
})

test('mobile sport picker and switcher refuse NBA preference without explicit NBA access', () => {
  for (const allowed of [false,true]) {
    const html=render('MobileResearchPicker',{path:'/the-paint',sport:'nba',nflAccess:true,nbaAccess:allowed,hasUltimate:true,onSport:noop,onClose:noop})
    const switcher=render('ResearchSportSwitcher',{sport:'nba',nflAccess:true,nbaAccess:allowed,onChange:noop})
    if (allowed) { assert.match(html,/NBA tools/);assert.match(html,/href="\/the-paint\?view=ladders/);assert.match(switcher,/>NBA<\/span>/) }
    else { assert.doesNotMatch(html,/href="\/the-paint|NBA tools/);assert.doesNotMatch(switcher,/>NBA<\/span>/) }
    assert.match(html,/NFL tools/)
    assert.match(html,/MLB tools/)
  }
})
