// Local-only component fixture. No authentication bypass or production database.
// Run after npm run build, then inspect http://127.0.0.1:4186 with agent-browser.
import { createServer } from 'node:http'
import { readFileSync, readdirSync } from 'node:fs'
import { build } from 'esbuild'

const bundled = await build({
  stdin: { contents: "import { createRoot } from 'react-dom/client'; import Page from './src/app/admin/nfl-access/page'; createRoot(document.getElementById('root')).render(<Page />)", loader: 'tsx', resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  tsconfig: 'tsconfig.json', define: { 'process.env.NODE_ENV': '"development"' },
})
const css = readdirSync('.next/static/chunks').filter(name => name.endsWith('.css'))
  .map(name => readFileSync('.next/static/chunks/' + name, 'utf8')).join('\n')
const member = { id: '11111111-1111-4111-8111-111111111111', username: 'beta_tester', display_name: 'Beta Test Member', avatar_url: null }
let granted = false
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:4186')
  if (url.pathname === '/api/admin/nfl-access') {
    response.setHeader('content-type', 'application/json')
    if (request.method === 'POST') {
      let text = ''; for await (const chunk of request) text += chunk
      granted = JSON.parse(text).granted
      response.end(JSON.stringify({ granted })); return
    }
    response.end(JSON.stringify(url.searchParams.has('q') ? {
      users: /beta|test/i.test(url.searchParams.get('q') ?? '') ? [{ ...member, granted }] : [],
    } : { count: granted ? 1 : 0, grants: granted ? [{ user_id: member.id, member, granted_at: new Date().toISOString() }] : [] }))
    return
  }
  if (url.pathname === '/app.js') { response.setHeader('content-type', 'application/javascript'); response.end(bundled.outputFiles[0].text); return }
  if (url.pathname === '/app.css') { response.setHeader('content-type', 'text/css'); response.end(css); return }
  response.setHeader('content-type', 'text/html')
  response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="background:#080c10;color:white;font-family:Arial,sans-serif"><div id="root"></div><script src="/app.js"></script></body></html>')
})
server.listen(4186, '127.0.0.1', () => console.log('NFL access UI fixture: http://127.0.0.1:4186 (mock data only)'))
