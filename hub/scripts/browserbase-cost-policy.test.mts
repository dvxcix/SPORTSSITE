import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = async (path: string) => readFile(new URL(path, import.meta.url), 'utf8')

test('generic sessions default to no paid proxy and carry cost attribution metadata', async () => {
  const browserbase = await source('../src/lib/browserbase.ts')
  assert.match(browserbase, /opts\.proxies \?\? false/)
  assert.match(browserbase, /proxyMode/)
  assert.match(browserbase, /region: BROWSERBASE_REGION/)
})

test('every authenticated vendor uses selective proxy routing with a direct fallback', async () => {
  const browserbase = await source('../src/lib/browserbase.ts')
  const mgm = await source('../src/app/api/cron/scrape-mgm/route.ts')
  const fanduel = await source('../src/app/api/cron/scrape-fanduel/route.ts')
  const fanduelNfl = await source('../src/app/api/cron/scrape-fanduel-nfl/route.ts')

  assert.match(browserbase, /PIKKIT_PROXY_DOMAIN_PATTERN/)
  assert.match(browserbase, /\{ type: 'none' as const \}/)
  assert.match(mgm, /proxyDomainPattern: BETMGM_PROXY_DOMAIN_PATTERN/)
  assert.match(fanduel, /proxyDomainPattern: FANDUEL_PROXY_DOMAIN_PATTERN/)
  assert.match(fanduelNfl, /proxyDomainPattern: FANDUEL_PROXY_DOMAIN_PATTERN/)
})

test('Pikkit does not intercept protected page resources', async () => {
  const mlb = await source('../src/app/api/cron/scrape-pikkit/route.ts')
  const nfl = await source('../src/app/api/cron/scrape-pikkit-nfl/route.ts')
  assert.doesNotMatch(mlb, /installTextOnlyRouting/)
  assert.doesNotMatch(nfl, /installTextOnlyRouting/)
})
