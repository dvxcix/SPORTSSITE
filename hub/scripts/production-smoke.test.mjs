import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = file => readFile(path.join(root, file), 'utf8')

test('desktop updater configuration is production-safe', async () => {
  const config = JSON.parse(await read('desktop/src-tauri/tauri.conf.json'))
  const cargo = await read('desktop/src-tauri/Cargo.toml')
  const capability = JSON.parse(await read('desktop/src-tauri/capabilities/main.json'))
  assert.equal(cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1], config.version)
  assert.match(config.plugins.updater.endpoints[0], /^https:\/\/www\.slipsurge\.com\/api\/desktop\/update\//)
  assert.ok(config.plugins.updater.pubkey.length > 40)
  assert.deepEqual(capability.remote.urls, ['https://www.slipsurge.com/*'])
})

test('production web security headers remain enabled', async () => {
  const source = await read('next.config.ts')
  for (const header of ['Strict-Transport-Security', 'X-Content-Type-Options', 'Permissions-Policy', 'Referrer-Policy']) {
    assert.ok(source.includes(header), `${header} is missing`)
  }
})

test('critical pipelines write health telemetry', async () => {
  const jobs = [
    'bdl-odds', 'dispatch-scrapes', 'scrape-fanduel', 'lineup-confirmed', 'hr-alerts',
    'near-hr-alerts', 'dugout-statcast-precompute', 'dugout-matchup-edge-precompute',
    'whop-reconcile', 'whop-addon-reconcile',
  ]
  for (const job of jobs) {
    const source = await read(`src/app/api/cron/${job}/route.ts`)
    assert.ok(source.includes(`withPipelineHealth('${job}', run)`), `${job} is not instrumented`)
  }
})

test('desktop notifications include realtime and reconnect catch-up', async () => {
  const source = await read('src/components/desktop/DesktopExperience.tsx')
  assert.ok(source.includes(".on('postgres_changes'"))
  assert.ok(source.includes(".gt('created_at', cursor)"))
  assert.ok(source.includes("window.addEventListener('focus', resume)"))
})

test('release workflow validates before publishing', async () => {
  const workflow = await read('../.github/workflows/desktop-release.yml')
  const typecheck = workflow.indexOf('npm run typecheck')
  const smoke = workflow.indexOf('npm run test:production')
  const publish = workflow.indexOf('npm run desktop:publish-update')
  assert.ok(typecheck >= 0 && smoke > typecheck && publish > smoke)
  assert.ok(workflow.includes("github.ref == 'refs/heads/main'"))
})
