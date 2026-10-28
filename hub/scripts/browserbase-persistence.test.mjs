import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../package.json', import.meta.url))
const ts = require('typescript')
const source = fs.readFileSync(new URL('../src/lib/browserbase.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText

async function fixture(options, work) {
  const old = Object.fromEntries(['BROWSERBASE_API_KEY', 'BROWSERBASE_PROJECT_ID', 'PIKKIT_CONTEXT_ID'].map(key => [key, process.env[key]]))
  process.env.BROWSERBASE_API_KEY = 'fixture-key'
  process.env.BROWSERBASE_PROJECT_ID = 'fixture-project'
  if (options.configured !== false) process.env.PIKKIT_CONTEXT_ID = 'production-context'
  else delete process.env.PIKKIT_CONTEXT_ID
  const calls = { create: [], release: [], retrieve: [], contexts: [], navigation: [], newContext: 0, disconnect: 0, leaseAcquire: 0, leaseRelease: 0, warnings: [], budget: [], workflows: [], timers: [], cleared: [] }
  let released = false
  const page = { goto: async (...args) => { calls.navigation.push(args); if (options.gotoFails) throw Error('navigation failed') } }
  const context = { pages: () => options.noPage ? [] : [page], newPage: async () => { if (options.newPageFails) throw Error('page failed'); return page } }
  const browser = {
    contexts: () => options.noDefault ? [] : [context],
    newContext: async () => { calls.newContext++; return context },
    close: async () => { calls.disconnect++; if (options.closeFails) throw Error('disconnect failed') },
  }
  const cloud = {
    projects: { usage: async () => ({ browserMinutes: 12, proxyBytes: 20 }) },
    contexts: {
      retrieve: async id => { calls.contexts.push(['retrieve', id]); if (options.contextMissing) throw Error('context missing'); return { id } },
      create: async () => { calls.contexts.push(['create']); return { id: 'new-context' } },
    },
    sessions: {
      list: async query => (options.sessions ?? []).filter(session => !query?.status || session.status === query.status),
      create: async params => { calls.create.push(params); if (options.createFails) throw Error('creation uncertain'); return { id: 'new-session', connectUrl: 'fixture-connect', expiresAt: '2026-10-24T04:00:00Z' } },
      update: async (id, params) => { calls.release.push([id, params]); if (options.releaseFails) throw Error('sensitive SDK error'); released = true; return { status: options.releaseStatus ?? 'COMPLETED' } },
      retrieve: async id => {
        calls.retrieve.push(id)
        if (options.retrieveFails) throw Error('lookup unavailable')
        return { status: options.retrieveStatus ?? (released || options.releaseFails ? 'COMPLETED' : 'RUNNING'), contextId: calls.create.at(-1)?.browserSettings.context?.id }
      },
      debug: async id => { if (options.debugFails) throw Error('debug failed'); return { debuggerFullscreenUrl: 'https://fixture/live/' + id } },
    },
  }
  const mocks = {
    '@browserbasehq/sdk': { default: class { constructor() { return cloud } } },
    'playwright-core': { chromium: { connectOverCDP: async () => { if (options.connectFails) throw Error('CDP failed'); return browser } } },
    '@/lib/pikkitBrowserLease': { acquirePikkitBrowserLease: async () => { calls.leaseAcquire++; return options.leaseBusy ? null : { release: async () => { calls.leaseRelease++; return true } } } },
    '@/lib/nbaBrowserBudget': {
      reserveNbaBrowserBudget: async input => {
        calls.budget.push(['reserve', input.timeoutSeconds, calls.create.length])
        calls.workflows.push(['reserve', input.workflow])
        if (options.budgetReject) throw Error('NBA browser budget unavailable')
        await input.readUsage()
        return { id: 'fixture-reservation' }
      },
      checkNbaBrowserBudgetUsage: async input => {
        calls.budget.push(['check'])
        calls.workflows.push(['check', input.workflow])
        await input.readUsage()
        if (options.watchReject) throw Error('NBA browser usage exceeded')
      },
    },
  }
  const compiledModule = { exports: {} }
  const setTimer = options.fakeTimers ? (fn, ms) => { const timer = { fn, ms }; calls.timers.push(timer); return timer } : setTimeout
  const clearTimer = options.fakeTimers ? timer => { calls.cleared.push(timer) } : clearTimeout
  new Function('require', 'module', 'exports', 'console', 'setTimeout', 'clearTimeout', compiled)(id => { if (!(id in mocks)) throw Error('Unexpected import: ' + id); return mocks[id] }, compiledModule, compiledModule.exports, { warn: message => calls.warnings.push(message) }, setTimer, clearTimer)
  try { await work(compiledModule.exports, calls) }
  finally { for (const [key, value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } }
}

const session = (overrides = {}) => ({ id: 'older-session', contextId: 'production-context', status: 'RUNNING', updatedAt: '2026-10-01T00:00:00Z', expiresAt: '2026-10-24T04:00:00Z', userMetadata: { book: 'pikkit', mode: 'manual-auth' }, ...overrides })

test('NBA cannot create a paid session before an accepted durable reservation', async () => {
  await fixture({ budgetReject: true }, async (api, calls) => {
    await assert.rejects(api.openSession({ metadata: { sport: 'nba' } }), /budget unavailable/)
    assert.equal(calls.create.length, 0)
    assert.deepEqual(calls.budget, [['reserve', 300, 0]])
  })
  await fixture({}, async (api, calls) => {
    const bb = await api.openSession({ metadata: { sport: 'nba' }, solveCaptchas: true })
    await bb.close()
    assert.deepEqual(calls.budget, [['reserve', 300, 0]])
    assert.equal(calls.create[0].userMetadata.budgetReservation, 'fixture-reservation')
    assert.equal(calls.create[0].browserSettings.solveCaptchas, false)
  })
})

test('NBA uncertain creates consume one reservation and never retry', async () => {
  await fixture({ createFails: true }, async (api, calls) => {
    await assert.rejects(api.openSession({ metadata: { sport: 'nba' } }), /creation uncertain/)
    assert.equal(calls.create.length, 1)
    assert.equal(calls.budget.length, 1)
    assert.equal(calls.timers.length, 0)
  })
})

test('NBA book identity fixes the same public or direct workflow for admission and active checks', async () => {
  for (const book of ['pikkit', 'draftkings', 'betmgm', undefined]) {
    await fixture({ fakeTimers: true }, async (api, calls) => {
      const expected = book === 'pikkit' ? 'public' : 'direct'
      // An unrelated metadata field cannot override the fixed book mapping.
      const metadata = { sport: 'nba', workflow: expected === 'public' ? 'direct' : 'public' }
      const bb = book === 'pikkit'
        ? await api.openPikkitSession('production-context', metadata)
        : await api.openSession({ metadata: { ...metadata, ...(book ? { book } : {}) } })
      assert.deepEqual(calls.workflows, [['reserve', expected]])
      const watcher = calls.timers.find(timer => timer.ms === 5000)
      assert.ok(watcher)
      watcher.fn()
      for (let i = 0; i < 10; i++) await Promise.resolve()
      assert.deepEqual(calls.workflows, [['reserve', expected], ['check', expected]])
      await bb.close()
      assert.equal(calls.create.length, 1)
      assert.equal(calls.release.length, 1)
    })
  }
})

test('NBA runtime limit failure ends the remote session once and cancels its watcher', async () => {
  await fixture({ fakeTimers: true, watchReject: true }, async (api, calls) => {
    const bb = await api.openSession({ metadata: { sport: 'nba' } })
    const watcher = calls.timers.find(timer => timer.ms === 5000)
    assert.ok(watcher)
    watcher.fn()
    for (let i = 0; i < 10; i++) await Promise.resolve()
    await assert.rejects(bb.close(), /usage limit/)
    await assert.rejects(bb.close(), /usage limit/)
    assert.equal(calls.release.length, 1)
    assert.equal(calls.disconnect, 1)
    assert.equal(calls.timers.filter(timer => timer.ms === 5000).length, 1)
    assert.ok(calls.cleared.includes(watcher))
  })
})

test('normal NBA closure cancels future checks while NFL keeps its existing timeout', async () => {
  await fixture({ fakeTimers: true }, async (api, calls) => {
    const bb = await api.openSession({ metadata: { sport: 'nba' } })
    await bb.close()
    assert.ok(calls.cleared.includes(calls.timers.find(timer => timer.ms === 5000)))
    assert.equal(calls.budget.filter(item => item[0] === 'check').length, 0)
  })
  await fixture({ budgetReject: true }, async (api, calls) => {
    const bb = await api.openSession({ metadata: { sport: 'nfl' }, timeoutSeconds: 450 })
    await bb.close()
    assert.equal(calls.budget.length, 0)
    assert.equal(calls.create[0].timeout, 450)
  })
})

test('persisted automatic sessions use the saved default context and coalesce verified teardown', async () => {
  await fixture({}, async (api, calls) => {
    const browser = await api.openPikkitSession('production-context')
    const first = browser.close(), second = browser.close()
    assert.equal(first, second)
    await first
    assert.equal(calls.newContext, 0)
    assert.equal(calls.disconnect, 1)
    assert.equal(calls.release.length, 1)
    assert.deepEqual(calls.create[0].browserSettings.context, { id: 'production-context', persist: true })
  })
})

test('missing persisted default context fails closed and never creates an incognito fallback', async () => {
  await fixture({ noDefault: true }, async (api, calls) => {
    await assert.rejects(api.openPikkitSession('production-context'), /not restored/)
    assert.equal(calls.newContext, 0)
    assert.equal(calls.release.length, 1)
    assert.equal(calls.navigation.length, 0)
  })
})

test('anonymous sportsbook sessions retain their isolated-context fallback', async () => {
  await fixture({ noDefault: true }, async (api, calls) => {
    const browser = await api.openSession()
    await browser.close()
    assert.equal(calls.newContext, 1)
    assert.equal(calls.create[0].timeout, 300)
  })
})

test('opt-in sportsbook release confirms remote completion and coalesces concurrent callers', async () => {
  for (const options of [{}, { closeFails: true }, { releaseFails: true }, { releaseStatus: 'RUNNING', retrieveStatus: 'COMPLETED' }]) await fixture(options, async (api, calls) => {
    const browser = await api.openSession({ verifyRelease: true, timeoutSeconds: 300, solveCaptchas: false })
    const first = browser.close(), second = browser.close()
    assert.equal(first, second); await first
    assert.equal(calls.release.length, 1); assert.equal(calls.disconnect, 1)
    assert.equal(calls.create[0].browserSettings.context, undefined)
    assert.equal(calls.create[0].browserSettings.solveCaptchas, false)
    assert.equal(calls.create[0].timeout, 300)
  })
})

test('opt-in sportsbook release rejects uncertain or abnormal closure without leaking SDK errors', async () => {
  for (const options of [{ releaseFails: true, retrieveFails: true }, { releaseStatus: 'RUNNING', retrieveStatus: 'RUNNING' }, { releaseStatus: 'TIMED_OUT' }, { releaseStatus: 'ERROR' }]) await fixture(options, async (api, calls) => {
    const browser = await api.openSession({ verifyRelease: true })
    await assert.rejects(browser.close(), /^Error: Cloud browser release could not be verified$/)
    await assert.rejects(browser.close(), /^Error: Cloud browser release could not be verified$/)
    assert.equal(calls.release.length, 1); assert.ok(calls.retrieve.length <= 3)
  })
})

test('failed opt-in sportsbook startup verifies cleanup and preserves the original failure after confirmation', async () => {
  await fixture({ connectFails: true }, async (api, calls) => {
    await assert.rejects(api.openSession({ verifyRelease: true }), /CDP failed/)
    assert.equal(calls.release.length, 1)
  })
  await fixture({ connectFails: true, releaseFails: true, retrieveFails: true }, async (api, calls) => {
    await assert.rejects(api.openSession({ verifyRelease: true }), /^Error: Cloud browser release could not be verified$/)
    assert.equal(calls.release.length, 1)
  })
})

test('all running and pending users of the same context block resume, regardless of metadata', async () => {
  for (const status of ['RUNNING', 'PENDING']) for (const userMetadata of [{ book: 'pikkit', mode: 'nba-poll' }, { book: 'pikkit', mode: 'manual-auth' }, undefined]) {
    await fixture({ sessions: [session({ status, userMetadata })] }, async (api, calls) => {
      await assert.rejects(api.openPikkitSession('production-context'), /already in use/)
      assert.equal(calls.create.length, 0)
    })
  }
})

test('other-context sessions do not block the configured collector', async () => {
  await fixture({ sessions: [session({ contextId: 'different-context' })] }, async (api, calls) => {
    const browser = await api.openPikkitSession('production-context')
    await browser.close()
    assert.equal(calls.create.length, 1)
  })
})

test('release races reconcile only with a verified remote completed state', async () => {
  for (const options of [{ releaseFails: true }, { closeFails: true }, { releaseStatus: 'RUNNING', retrieveStatus: 'COMPLETED' }]) {
    await fixture(options, async (api, calls) => {
      const browser = await api.openPikkitSession('production-context')
      await browser.close()
      if (options.releaseFails) assert.equal(calls.retrieve.length, 1)
      if (options.releaseFails || options.closeFails) assert.equal(calls.warnings.length, 1)
    })
  }
})

test('unverified or abnormal persistent teardown rejects every caller without claiming closed', async () => {
  for (const options of [
    { releaseFails: true, retrieveFails: true },
    { releaseStatus: 'ERROR' },
    { releaseStatus: 'TIMED_OUT' },
    { releaseStatus: 'RUNNING', retrieveStatus: 'RUNNING' },
  ]) {
    await fixture(options, async (api, calls) => {
      const browser = await api.openPikkitSession('production-context')
      await assert.rejects(browser.close(), /could not be verified/)
      await assert.rejects(browser.close(), /could not be verified/)
      assert.equal(calls.release.length, 1)
    })
  }
})

test('CDP and page-setup failures release the created cloud session', async () => {
  for (const options of [{ connectFails: true }, { noPage: true, newPageFails: true }]) {
    await fixture(options, async (api, calls) => {
      await assert.rejects(api.openPikkitSession('production-context'))
      assert.equal(calls.release.length, 1)
    })
  }
})

test('manual reconnect always selects configured context even beyond twelve hours and newer other identities', async () => {
  await fixture({ sessions: [session({ contextId: 'different-context', updatedAt: new Date().toISOString() })] }, async (api, calls) => {
    const setup = await api.createPersistentContext()
    assert.equal(setup.contextId, 'production-context')
    assert.equal(setup.continuity, 'persisted-context')
    assert.equal(calls.contexts.some(call => call[0] === 'create'), false)
    assert.equal(calls.create[0].keepAlive, true)
    assert.equal(calls.disconnect, 1, 'manual CDP disconnect leaves the keepAlive browser available')
    assert.equal(calls.release.length, 0)
    assert.equal(calls.leaseAcquire, 1)
    assert.equal(calls.leaseRelease, 1)
  })
})

test('existing manual login reopens the same live view without spawning another browser', async () => {
  await fixture({ sessions: [session()] }, async (api, calls) => {
    const setup = await api.createPersistentContext()
    assert.equal(setup.continuity, 'running-session')
    assert.equal(setup.sessionId, 'older-session')
    assert.equal(calls.create.length, 0)
    assert.equal(calls.leaseRelease, 1)
  })
})

test('manual setup and explicit fresh setup cannot overlap active automatic work', async () => {
  for (const fresh of [false, true]) await fixture({ sessions: [session({ userMetadata: { mode: 'nba-poll' } })] }, async (api, calls) => {
    await assert.rejects(api.createPersistentContext(undefined, { fresh }), /in use/)
    assert.equal(calls.create.length, 0)
    assert.equal(calls.contexts.some(call => call[0] === 'create'), false)
    assert.equal(calls.leaseRelease, 1)
  })
})

test('busy shared lease prevents any manual setup work', async () => {
  await fixture({ leaseBusy: true }, async (api, calls) => {
    await assert.rejects(api.createPersistentContext(), /busy/)
    assert.equal(calls.contexts.length, 0)
    assert.equal(calls.create.length, 0)
  })
})

test('missing configured context fails without silently replacing its identity', async () => {
  await fixture({ contextMissing: true }, async (api, calls) => {
    await assert.rejects(api.createPersistentContext(), /context missing/)
    assert.equal(calls.create.length, 0)
    assert.deepEqual(calls.contexts, [['retrieve', 'production-context']])
    assert.equal(calls.leaseRelease, 1)
  })
})

test('manual missing default context and failed navigation release the session instead of handing off a broken login', async () => {
  for (const options of [{ noDefault: true }, { gotoFails: true }, { debugFails: true }, { connectFails: true }]) {
    await fixture(options, async (api, calls) => {
      await assert.rejects(api.createPersistentContext())
      assert.equal(calls.newContext, 0)
      assert.equal(calls.release.length, 1)
      assert.equal(calls.leaseRelease, 1)
    })
  }
})

test('uncertain manual creation or cleanup retains the safety lease', async () => {
  for (const options of [{ createFails: true }, { gotoFails: true, releaseFails: true, retrieveFails: true }]) {
    await fixture(options, async (api, calls) => {
      await assert.rejects(api.createPersistentContext())
      assert.equal(calls.leaseRelease, 0)
    })
  }
})

test('a new profile is created only for initial setup or an explicit fresh request', async () => {
  for (const options of [{ configured: false }, {}]) await fixture(options, async (api, calls) => {
    const setup = await api.createPersistentContext(undefined, { fresh: options.configured !== false })
    assert.equal(setup.continuity, 'new-context')
    assert.equal(setup.contextId, 'new-context')
    assert.equal(calls.contexts.filter(call => call[0] === 'create').length, 1)
  })
})
