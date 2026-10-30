import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import ts from 'typescript'

type Api = typeof import('../src/lib/nbaBrowserBudget.ts')
const enabled = {
  NBA_BROWSER_CAPTURE_ENABLED: 'true', NBA_BROWSER_DAILY_SESSION_LIMIT: '2', NBA_BROWSER_MONTHLY_SESSION_LIMIT: '4',
  NBA_BROWSER_DAILY_MINUTE_LIMIT: '10', NBA_BROWSER_MONTHLY_MINUTE_LIMIT: '20', NBA_BROWSER_BUDGET_RESET_DAY: '18',
  NBA_BROWSER_DAILY_CENT_LIMIT: '300', NBA_BROWSER_PERIOD_CENT_LIMIT: '5000',
}
type Args = Record<string, string | number | number[] | null>
function ledger() {
  let day = '2026-10-27', period = '2026-10-18'
  let recovery = false
  const reservations = new Map<string, unknown>(), counters = new Map<string, { sessions: number; minutes: number }>(), resets = new Map<string, number>()
  const states = new Map<string, { minutes: number; bytes: number; observedAt: number }>()
  const windows = new Map<string, { minutes: number; bytes: number; floor: number }>()
  const reserve = (args: Args) => {
    const key = String(args.p_project_id), minutes = Math.ceil(Number(args.p_timeout_seconds) / 60), id = args.p_id === null ? null : String(args.p_id)
    if (resets.has(key) && resets.get(key) !== args.p_reset_day) return { allowed: false, reason: 'period-configuration' }
    resets.set(key, Number(args.p_reset_day))
    const dailyKey = `${key}:day:${day}`, monthlyKey = `${key}:period:${period}`
    const usage = { minutes: Number(args.p_browser_minutes), bytes: Number(args.p_proxy_bytes), observedAt: Date.parse(String(args.p_observed_at)) }
    if (!Number.isFinite(usage.observedAt) || usage.observedAt > Date.now() || usage.observedAt < Date.now() - 30_000) return { allowed: false, reason: 'usage-stale' }
    const state = states.get(key)
    if (state && usage.observedAt < state.observedAt) return { allowed: false, reason: 'usage-reordered' }
    if (state && (usage.minutes < state.minutes || usage.bytes < state.bytes)) return { allowed: false, reason: 'usage-decreased' }
    const dayWindow = windows.get(dailyKey), periodWindow = windows.get(monthlyKey)
    if (!id && (!dayWindow || !periodWindow)) return { allowed: false, reason: 'budget-uninitialized' }
    const actual = (window: typeof dayWindow) => window ? Math.ceil((usage.bytes - window.bytes) / 1_000_000 + (usage.minutes - window.minutes) / 6) : 0
    const dayActual = actual(dayWindow), periodActual = actual(periodWindow)
    const dayFloor = Math.max(dayWindow?.floor ?? 0, dayActual), periodFloor = Math.max(periodWindow?.floor ?? 0, periodActual)
    const ids = args.p_game_ids
    const allowance = recovery && key === 'project-fixture' && day === '2026-10-28' && args.p_workflow === 'public'
      && Array.isArray(ids) && ids.length > 0 && ids.length <= 12 && ids.every(id => id >= 21717975 && id <= 21717986)
    const dailyCents = allowance ? 1200 : Number(args.p_daily_cents)
    const dailySessions = allowance ? 11 : Number(args.p_daily_sessions)
    const dailyMinutes = allowance ? 55 : Number(args.p_daily_minutes)
    states.set(key, usage)
    if (dayWindow) dayWindow.floor = dayFloor
    if (periodWindow) periodWindow.floor = periodFloor
    if (dayActual >= dailyCents) return { allowed: false, reason: 'daily-spend-limit' }
    if (periodActual >= Number(args.p_period_cents)) return { allowed: false, reason: 'period-spend-limit' }
    if (!id) return { allowed: true, reason: 'checked' }
    if (reservations.has(id)) return { allowed: false, reason: 'duplicate' }
    const reservedCents = Math.ceil(50 + minutes / 6)
    if (dayFloor + reservedCents > dailyCents) return { allowed: false, reason: 'daily-spend-limit' }
    if (periodFloor + reservedCents > Number(args.p_period_cents)) return { allowed: false, reason: 'period-spend-limit' }
    const daily = counters.get(dailyKey) ?? { sessions: 0, minutes: 0 }, monthly = counters.get(monthlyKey) ?? { sessions: 0, minutes: 0 }
    const reason = daily.sessions >= dailySessions ? 'daily-session-limit'
      : monthly.sessions >= Number(args.p_period_sessions) ? 'period-session-limit'
        : daily.minutes + minutes > dailyMinutes ? 'daily-minute-limit'
          : monthly.minutes + minutes > Number(args.p_period_minutes) ? 'period-minute-limit' : null
    if (reason) return { allowed: false, reason }
    const publicAttempt = [...reservations.values()].some(value => {
      const row = value as { workflow: string; day: string; projectId: string }
      return row.workflow === 'public' && row.day === day && row.projectId === key
    })
    if (args.p_workflow === 'direct' && !publicAttempt && (
      dayFloor + reservedCents + 51 > Number(args.p_daily_cents) || periodFloor + reservedCents + 51 > Number(args.p_period_cents)
      || daily.sessions + 2 > Number(args.p_daily_sessions) || monthly.sessions + 2 > Number(args.p_period_sessions)
      || daily.minutes + minutes + 5 > Number(args.p_daily_minutes) || monthly.minutes + minutes + 5 > Number(args.p_period_minutes)
    )) return { allowed: false, reason: 'public-share-reserved' }
    windows.set(dailyKey, { minutes: dayWindow?.minutes ?? usage.minutes, bytes: dayWindow?.bytes ?? usage.bytes, floor: dayFloor + reservedCents })
    windows.set(monthlyKey, { minutes: periodWindow?.minutes ?? usage.minutes, bytes: periodWindow?.bytes ?? usage.bytes, floor: periodFloor + reservedCents })
    for (const [counterKey, current] of [[dailyKey, daily], [monthlyKey, monthly]] as const) counters.set(counterKey, { sessions: current.sessions + 1, minutes: current.minutes + minutes })
    const value = { allowed: true, reason: 'reserved', id, day, periodStart: period, reservedMinutes: minutes, reservedCents, workflow: args.p_workflow, projectId: key,
      ...(allowance ? { allowanceKey: 'nba-public-count-recovery-2026-10-28', allowanceExpiresAt: '2026-10-29T00:00:00.000Z' } : {}) }
    reservations.set(id, value)
    return value
  }
  return { reserve, reservations, counters, windows, states, date(nextDay: string, nextPeriod = period) { day = nextDay; period = nextPeriod },
    enableRecovery() { recovery = true } }
}
async function harness(options: {
  env?: Record<string, string | undefined>; db?: ReturnType<typeof ledger>; rpc?: (args: Args) => unknown | Promise<unknown>;
  uuid?: () => string; immediateTimeout?: boolean;
} = {}) {
  const source = await readFile(new URL('../src/lib/nbaBrowserBudget.ts', import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const calls: Args[] = [], db = options.db ?? ledger(), env = { ...enabled, ...options.env }
  let reads = 0, timers = 0, cleared = 0
  const target = { exports: {} }, dependencies: Record<string, unknown> = {
    'server-only': {}, 'node:crypto': { randomUUID: options.uuid ?? randomUUID },
    './supabase/admin': { createAdminClient: () => ({ rpc(name: string, args: Args) {
      assert.equal(name, 'apply_nba_browser_spend_budget'); calls.push(args)
      return { abortSignal(signal: AbortSignal) { assert.ok(signal instanceof AbortSignal); return Promise.resolve().then(async () => ({ data: options.rpc ? await options.rpc(args) : db.reserve(args), error: null })) } }
    } }) },
  }
  new Function('require', 'module', 'exports', 'process', 'setTimeout', 'clearTimeout', output)(
    (name: string) => { assert.ok(name in dependencies, name); return dependencies[name] }, target, target.exports, { env },
    (callback: () => void, delay: number) => { timers++; assert.equal(delay, 5000); return setTimeout(callback, options.immediateTimeout ? 1 : delay) },
    (timer: ReturnType<typeof setTimeout>) => { cleared++; clearTimeout(timer) },
  )
  const api = target.exports as Api
  const input = { projectId: 'project-fixture', workflow: 'public' as const, timeoutSeconds: 300, readUsage: async () => { reads++; return { browserMinutes: 2, proxyBytes: 10 } } }
  return { api, input, calls, db, env, metrics: () => ({ reads, timers, cleared }) }
}
async function rejectsCode(work: Promise<unknown>, code: string) {
  await assert.rejects(work, (error: unknown) => {
    assert.equal((error as { name: string }).name, 'NbaBrowserBudgetError')
    assert.equal((error as { code: string }).code, code)
    assert.doesNotMatch(String(error), /credential|https:|secret/i)
    return true
  })
}

test('capture admission defaults closed without explicit enablement or any required quota', async () => {
  for (const value of [undefined, 'false', 'TRUE', '1', ' true ']) {
    const h = await harness({ env: { NBA_BROWSER_CAPTURE_ENABLED: value } })
    await rejectsCode(h.api.reserveNbaBrowserBudget(h.input), 'paused')
    assert.equal(h.metrics().reads, 0); assert.equal(h.calls.length, 0)
  }
  for (const name of Object.keys(enabled).filter(name => name !== 'NBA_BROWSER_CAPTURE_ENABLED')) {
    const h = await harness({ env: { [name]: undefined } })
    await rejectsCode(h.api.reserveNbaBrowserBudget(h.input), 'configuration')
    assert.equal(h.metrics().reads, 0); assert.equal(h.calls.length, 0)
  }
})

test('malformed or excessive limits never silently fall back to defaults', async () => {
  for (const name of Object.keys(enabled).filter(name => name !== 'NBA_BROWSER_CAPTURE_ENABLED')) {
    for (const value of ['', ' ', '0', '-1', '1e3', '1.5', '12oops', '999999999999999999']) {
      const h = await harness({ env: { [name]: value } })
      await rejectsCode(h.api.reserveNbaBrowserBudget(h.input), 'configuration')
      assert.equal(h.calls.length, 0)
    }
  }
  for (const timeoutSeconds of [0, 59, 301, 450, NaN, Infinity, 60.5]) {
    const h = await harness()
    await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, timeoutSeconds }), 'configuration')
    assert.equal(h.metrics().reads, 0)
  }
})

test('only additional usage is charged, and actual cost plus new reservation controls admission', async () => {
  const h = await harness()
  let bytes = 112_000_000_000
  const input = { ...h.input, readUsage: async () => ({ browserMinutes: 100_000, proxyBytes: bytes }) }
  const first = await h.api.reserveNbaBrowserBudget(input)
  assert.equal(first.reservedCents, 51)
  assert.equal(h.db.windows.get('project-fixture:day:2026-10-27')?.floor, 51)
  bytes += 250_000_000
  await rejectsCode(h.api.reserveNbaBrowserBudget(input), 'spend-limit')
  assert.equal(h.db.reservations.size, 1)
  assert.equal(h.db.windows.get('project-fixture:day:2026-10-27')?.floor, 250)
  await h.api.checkNbaBrowserBudgetUsage(input)
  assert.equal(h.db.windows.get('project-fixture:day:2026-10-27')?.floor, 250)
})

test('provider error, invalid values and a hung callback fail closed without leaking provider text', async () => {
  const invalid = [null, { browserMinutes: NaN, proxyBytes: 0 }, { browserMinutes: -1, proxyBytes: 0 }, { browserMinutes: 1, proxyBytes: -1 }, { browserMinutes: 1, proxyBytes: 0.1 }, { browserMinutes: Infinity, proxyBytes: 0 }, { browserMinutes: '1', proxyBytes: 0 }]
  for (const value of invalid) {
    const h = await harness()
    await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, readUsage: async () => value as never }), 'usage-unavailable')
    assert.equal(h.calls.length, 0)
  }
  const h = await harness({ immediateTimeout: true })
  await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, readUsage: async () => { throw Error('https://credential:secret@example.test') } }), 'usage-unavailable')
  await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, readUsage: () => new Promise(() => {}) }), 'usage-unavailable')
  assert.equal(h.calls.length, 0); assert.equal(h.metrics().timers, h.metrics().cleared)
})

test('active usage checks always reread provider state and never reserve or cache success', async () => {
  const h = await harness()
  await rejectsCode(h.api.checkNbaBrowserBudgetUsage(h.input), 'reservation-unavailable')
  await h.api.reserveNbaBrowserBudget(h.input)
  assert.deepEqual(await h.api.checkNbaBrowserBudgetUsage(h.input), { browserMinutes: 2, proxyBytes: 10 })
  await h.api.checkNbaBrowserBudgetUsage(h.input)
  await rejectsCode(h.api.checkNbaBrowserBudgetUsage({ ...h.input, readUsage: async () => ({ browserMinutes: 2, proxyBytes: 300_000_010 }) }), 'spend-limit')
  h.env.NBA_BROWSER_CAPTURE_ENABLED = 'false'
  await rejectsCode(h.api.checkNbaBrowserBudgetUsage(h.input), 'paused')
  assert.equal(h.metrics().reads, 4); assert.equal(h.calls.length, 5)
  assert.equal(h.db.reservations.size, 1)
})

test('independent instances admit only the atomic daily quota and reserve full runtime per actual session', async () => {
  const db = ledger(), instances = await Promise.all(Array.from({ length: 20 }, () => harness({ db })))
  const attempts = await Promise.allSettled(instances.map(h => h.api.reserveNbaBrowserBudget(h.input)))
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 2)
  assert.equal(db.reservations.size, 2)
  assert.deepEqual(db.counters.get('project-fixture:day:2026-10-27'), { sessions: 2, minutes: 10 })
  assert.ok(attempts.filter(result => result.status === 'rejected').every(result => (result as PromiseRejectedResult).reason.code === 'quota-limit'))
})

test('daily, period and minute quotas are independent, rounded, and never refund old observations', async () => {
  const h = await harness({ env: { NBA_BROWSER_DAILY_SESSION_LIMIT: '10', NBA_BROWSER_MONTHLY_SESSION_LIMIT: '20', NBA_BROWSER_DAILY_MINUTE_LIMIT: '3', NBA_BROWSER_MONTHLY_MINUTE_LIMIT: '4' } })
  const first = await h.api.reserveNbaBrowserBudget({ ...h.input, timeoutSeconds: 61 })
  assert.equal(first.reservedMinutes, 2)
  await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, timeoutSeconds: 61 }), 'quota-limit')
  h.db.date('2026-10-28')
  await h.api.reserveNbaBrowserBudget({ ...h.input, timeoutSeconds: 61 })
  await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, timeoutSeconds: 60 }), 'quota-limit')
  h.db.date('2026-11-18', '2026-11-18')
  await h.api.reserveNbaBrowserBudget({ ...h.input, timeoutSeconds: 60 })
  assert.equal(h.db.reservations.size, 3)
  assert.deepEqual(h.db.counters.get('project-fixture:period:2026-10-18'), { sessions: 2, minutes: 4 })
})

test('period session cap survives day rollover and reset-day changes cannot manufacture a new budget', async () => {
  const h = await harness({ env: { NBA_BROWSER_DAILY_SESSION_LIMIT: '10', NBA_BROWSER_MONTHLY_SESSION_LIMIT: '1' } })
  await h.api.reserveNbaBrowserBudget(h.input)
  h.db.date('2026-10-28')
  await rejectsCode(h.api.reserveNbaBrowserBudget(h.input), 'quota-limit')
  h.env.NBA_BROWSER_BUDGET_RESET_DAY = '19'
  await rejectsCode(h.api.reserveNbaBrowserBudget(h.input), 'reservation-unavailable')
  assert.equal(h.db.reservations.size, 1)
})

test('uncertain database commit remains charged and no retry or refund is attempted', async () => {
  const db = ledger(), h = await harness({ db, env: { NBA_BROWSER_DAILY_SESSION_LIMIT: '1' }, rpc: args => { db.reserve(args); throw Error('https://credential:secret@example.test') } })
  await rejectsCode(h.api.reserveNbaBrowserBudget(h.input), 'reservation-unavailable')
  assert.equal(h.calls.length, 1); assert.equal(db.reservations.size, 1)
  const next = await harness({ db, env: { NBA_BROWSER_DAILY_SESSION_LIMIT: '1' } })
  await rejectsCode(next.api.reserveNbaBrowserBudget(next.input), 'quota-limit')
  assert.equal(db.reservations.size, 1)
})

test('duplicate reservation tokens cannot authorize another session or double-charge', async () => {
  const h = await harness({ uuid: () => '00000000-0000-0000-0000-000000000001' })
  await h.api.reserveNbaBrowserBudget(h.input)
  await rejectsCode(h.api.reserveNbaBrowserBudget(h.input), 'reservation-unavailable')
  assert.equal(h.db.reservations.size, 1)
  assert.deepEqual(h.db.counters.get('project-fixture:day:2026-10-27'), { sessions: 1, minutes: 5 })
})

test('malformed or missing reservation confirmation never authorizes a create', async () => {
  for (const data of [null, true, { allowed: true }, { allowed: false, reason: 'unknown' }, { allowed: 'true', reason: 'reserved' }]) {
    const h = await harness({ rpc: () => data })
    await rejectsCode(h.api.reserveNbaBrowserBudget(h.input), 'reservation-unavailable')
    assert.equal(h.calls.length, 1)
  }
})

test('migration is service-only and locks project before bounded quota reads; ledger is not expiring cache', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261027224022_nba_browser_budget_ledger.sql', import.meta.url), 'utf8')
  assert.ok(sql.indexOf('for update') < sql.indexOf('select * into strict v_daily'))
  assert.equal((sql.match(/enable row level security/g) ?? []).length, 3)
  assert.ok(sql.includes('security invoker'))
  assert.ok(sql.includes('from public,anon,authenticated,service_role'))
  assert.ok(sql.includes('grant execute on function public.reserve_nba_browser_budget'))
  assert.ok(sql.includes("at time zone 'UTC'"))
  assert.doesNotMatch(sql, /delete from|truncate|nba_source_cache|expires_at/i)
})

test('above-approved cent limits and malformed monetary configuration are rejected', async () => {
  for (const env of [{ NBA_BROWSER_DAILY_CENT_LIMIT: '301' }, { NBA_BROWSER_PERIOD_CENT_LIMIT: '5001' }]) {
    const h = await harness({ env })
    await rejectsCode(h.api.reserveNbaBrowserBudget(h.input), 'configuration')
    assert.equal(h.metrics().reads, 0)
  }
})

test('scoped recovery admits six further public attempts atomically while preserving prior floors and debits', async () => {
  const db = ledger(), env = { NBA_BROWSER_DAILY_SESSION_LIMIT: '5', NBA_BROWSER_MONTHLY_SESSION_LIMIT: '98', NBA_BROWSER_DAILY_MINUTE_LIMIT: '25', NBA_BROWSER_MONTHLY_MINUTE_LIMIT: '490' }
  db.date('2026-10-28')
  const seed = await harness({ db, env })
  for (let i = 0; i < 5; i++) await seed.api.reserveNbaBrowserBudget(seed.input)
  await rejectsCode(seed.api.checkNbaBrowserBudgetUsage({ ...seed.input, readUsage: async () => ({ browserMinutes: 2, proxyBytes: 624_000_010 }) }), 'spend-limit')
  const priorIds = [...db.reservations.keys()], baseline = { ...db.windows.get('project-fixture:day:2026-10-28')! }
  assert.equal(baseline.floor, 624)
  db.enableRecovery()
  const instances = await Promise.all(Array.from({ length: 12 }, () => harness({ db, env })))
  const attempts = await Promise.allSettled(instances.map(h => h.api.reserveNbaBrowserBudget({ ...h.input, gameIds: [21717986, 21717975], readUsage: async () => ({ browserMinutes: 2, proxyBytes: 624_000_010 }) })))
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 6)
  assert.equal(db.reservations.size, 11)
  assert.deepEqual(db.counters.get('project-fixture:day:2026-10-28'), { sessions: 11, minutes: 55 })
  assert.equal(db.windows.get('project-fixture:day:2026-10-28')?.floor, 624 + 6 * 51)
  assert.equal(db.windows.get('project-fixture:day:2026-10-28')?.minutes, baseline.minutes)
  assert.equal(db.windows.get('project-fixture:day:2026-10-28')?.bytes, baseline.bytes)
  assert.ok(priorIds.every(id => db.reservations.has(id)))
  assert.deepEqual(instances[0].calls[0].p_game_ids, [21717975, 21717986])
  const admitted = attempts.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<Api['reserveNbaBrowserBudget']>>>
  assert.equal(admitted.value.allowanceExpiresAt, '2026-10-29T00:00:00.000Z')
})

test('recovery cannot authorize direct, missing/mixed scope, another project, expired day or period exhaustion', async () => {
  const h = await harness({ env: { NBA_BROWSER_DAILY_SESSION_LIMIT: '5', NBA_BROWSER_MONTHLY_SESSION_LIMIT: '98', NBA_BROWSER_DAILY_MINUTE_LIMIT: '25', NBA_BROWSER_MONTHLY_MINUTE_LIMIT: '490' } })
  h.db.date('2026-10-28'); h.db.enableRecovery()
  await h.api.reserveNbaBrowserBudget(h.input)
  const higherUsage = async () => ({ browserMinutes: 2, proxyBytes: 624_000_010 })
  for (const extra of [{}, { workflow: 'direct' as const, gameIds: [21717975] }, { gameIds: [21717975, 21717987] }]) {
    await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, ...extra, readUsage: higherUsage }), 'spend-limit')
  }
  const input = { ...h.input, gameIds: [21717975], readUsage: higherUsage }
  await h.api.checkNbaBrowserBudgetUsage(input)
  assert.deepEqual(h.calls.at(-1)?.p_game_ids, [21717975])
  await rejectsCode(h.api.checkNbaBrowserBudgetUsage({ ...input, readUsage: async () => ({ browserMinutes: 2, proxyBytes: 1_200_000_010 }) }), 'spend-limit')
  // A period guard still wins even though the dated daily allowance is available.
  const p = await harness({ db: h.db, env: { NBA_BROWSER_PERIOD_CENT_LIMIT: '600' } })
  await rejectsCode(p.api.reserveNbaBrowserBudget({ ...p.input, gameIds: [21717975], readUsage: async () => ({ browserMinutes: 2, proxyBytes: 1_200_000_010 }) }), 'spend-limit')
  h.db.date('2026-10-29')
  const next = await h.api.reserveNbaBrowserBudget({ ...input, readUsage: async () => ({ browserMinutes: 2, proxyBytes: 1_200_000_010 }) })
  assert.equal(next.allowanceKey, undefined)
  const another = await h.api.reserveNbaBrowserBudget({ ...h.input, projectId: 'other-project', gameIds: [21717975] })
  assert.equal(another.allowanceKey, undefined)
})

test('malformed scopes fail before usage/RPC; large ordinary scopes preserve normal budget behavior', async () => {
  for (const gameIds of [[], [21717975, 21717975], [0], [-1], [1.5], [NaN], Array.from({ length: 101 }, (_, i) => i + 1), '21717975']) {
    const h = await harness()
    await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, gameIds: gameIds as number[] }), 'configuration')
    assert.equal(h.metrics().reads, 0); assert.equal(h.calls.length, 0)
  }
  const h = await harness(); h.db.date('2026-10-28'); h.db.enableRecovery()
  const ordinary = await h.api.reserveNbaBrowserBudget({ ...h.input, gameIds: Array.from({ length: 13 }, (_, i) => 21717975 + i) })
  assert.equal(ordinary.allowanceKey, undefined)
})

test('recovery confirmation cannot smuggle another scope or expiry into the browser lifetime', async () => {
  for (const extra of [{ allowanceKey: 'unreviewed', allowanceExpiresAt: '2026-10-29T00:00:00.000Z' }, { allowanceKey: 'nba-public-count-recovery-2026-10-28', allowanceExpiresAt: '2026-10-30T00:00:00.000Z' }, { allowanceKey: 'nba-public-count-recovery-2026-10-28' }]) {
    const h = await harness({ rpc: args => ({ allowed: true, reason: 'reserved', id: args.p_id, day: '2026-10-28', periodStart: '2026-10-18', reservedMinutes: 5, reservedCents: 51, ...extra }) })
    await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, gameIds: [21717975] }), 'reservation-unavailable')
  }
})

test('a reserved floor at the cap allows its active session, but actual cost reaching the cap stops it', async () => {
  const h = await harness({ env: { NBA_BROWSER_DAILY_CENT_LIMIT: '102' } })
  await h.api.reserveNbaBrowserBudget(h.input)
  await h.api.reserveNbaBrowserBudget(h.input)
  assert.equal(h.db.windows.get('project-fixture:day:2026-10-27')?.floor, 102)
  await h.api.checkNbaBrowserBudgetUsage(h.input)
  await rejectsCode(h.api.reserveNbaBrowserBudget(h.input), 'spend-limit')
  await rejectsCode(h.api.checkNbaBrowserBudgetUsage({ ...h.input, readUsage: async () => ({ browserMinutes: 2, proxyBytes: 102_000_010 }) }), 'spend-limit')
  assert.equal(h.db.reservations.size, 2)
})

test('usage decrease/reset and invalid fresh-sample timestamps cannot reopen budget', async () => {
  const h = await harness()
  await h.api.reserveNbaBrowserBudget(h.input)
  await h.api.checkNbaBrowserBudgetUsage({ ...h.input, readUsage: async () => ({ browserMinutes: 20, proxyBytes: 10_000_010 }) })
  await rejectsCode(h.api.reserveNbaBrowserBudget(h.input), 'usage-unavailable')
  h.db.date('2026-11-18', '2026-11-18')
  await rejectsCode(h.api.reserveNbaBrowserBudget(h.input), 'usage-unavailable')
  const before = [...h.db.windows.entries()].map(([key, value]) => [key, { ...value }])
  for (const observed of [new Date(Date.now() - 31_000).toISOString(), new Date(Date.now() + 1000).toISOString()]) {
    const result = h.db.reserve({ ...h.calls[0], p_id: randomUUID(), p_observed_at: observed })
    assert.equal(result.reason, 'usage-stale')
  }
  assert.deepEqual([...h.db.windows.entries()], before)
})

test('concurrent watch/admission shares one nondecreasing monetary floor', async () => {
  const db = ledger(), first = await harness({ db, env: { NBA_BROWSER_DAILY_SESSION_LIMIT: '10', NBA_BROWSER_DAILY_MINUTE_LIMIT: '50' } })
  await first.api.reserveNbaBrowserBudget(first.input)
  const watch = await harness({ db }), attempts = await Promise.all(Array.from({ length: 5 }, () => harness({ db, env: { NBA_BROWSER_DAILY_SESSION_LIMIT: '10', NBA_BROWSER_DAILY_MINUTE_LIMIT: '50' } })))
  const observed = { browserMinutes: 2, proxyBytes: 200_000_010 }
  await watch.api.checkNbaBrowserBudgetUsage({ ...watch.input, readUsage: async () => observed })
  const results = await Promise.allSettled(attempts.map(h => h.api.reserveNbaBrowserBudget({ ...h.input, readUsage: async () => observed })))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(db.windows.get('project-fixture:day:2026-10-27')?.floor, 251)
  assert.equal(db.reservations.size, 2)
})

test('day rollover has a new baseline but retains the period floor and cannot bypass its cap', async () => {
  const h = await harness({ env: { NBA_BROWSER_PERIOD_CENT_LIMIT: '102' } })
  await h.api.reserveNbaBrowserBudget(h.input)
  h.db.date('2026-10-28')
  await h.api.reserveNbaBrowserBudget(h.input)
  h.db.date('2026-10-29')
  await rejectsCode(h.api.reserveNbaBrowserBudget(h.input), 'spend-limit')
  assert.equal(h.db.windows.get('project-fixture:period:2026-10-18')?.floor, 102)
  assert.equal(h.db.windows.has('project-fixture:day:2026-10-29'), false)
})

test('additional spend migration bounds approved dollars and disables the legacy admission bypass', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261027230956_nba_browser_additional_spend_budget.sql', import.meta.url), 'utf8')
  assert.ok(sql.includes('p_daily_cents not between 1 and 300'))
  assert.ok(sql.includes('p_period_cents not between 1 and 5000'))
  assert.ok(sql.indexOf('for update') < sql.indexOf('select * into v_state'))
  assert.ok(sql.includes('greatest(v_day_spend.cost_floor_cents,v_day_actual)'))
  assert.ok(sql.includes('revoke all on function public.reserve_nba_browser_budget'))
  assert.ok(sql.includes('from public,anon,authenticated,service_role'))
  assert.equal((sql.match(/enable row level security/g) ?? []).length, 2)
  assert.doesNotMatch(sql, /delete from|truncate|nba_source_cache|expires_at/i)
})

test('direct-first concurrency preserves one complete public reservation without charging its hold', async () => {
  const db = ledger(), env = { NBA_BROWSER_DAILY_SESSION_LIMIT: '5', NBA_BROWSER_MONTHLY_SESSION_LIMIT: '80', NBA_BROWSER_DAILY_MINUTE_LIMIT: '25', NBA_BROWSER_MONTHLY_MINUTE_LIMIT: '400' }
  const instances = await Promise.all(Array.from({ length: 10 }, () => harness({ db, env })))
  const results = await Promise.allSettled(instances.map(h => h.api.reserveNbaBrowserBudget({ ...h.input, workflow: 'direct' })))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 4)
  assert.equal(db.windows.get('project-fixture:day:2026-10-27')?.floor, 204)
  assert.equal(db.reservations.size, 4)
  const publicCapture = await harness({ db, env })
  await publicCapture.api.checkNbaBrowserBudgetUsage({ ...publicCapture.input, workflow: 'direct' })
  await publicCapture.api.reserveNbaBrowserBudget(publicCapture.input)
  assert.equal(db.reservations.size, 5)
  assert.equal(db.windows.get('project-fixture:day:2026-10-27')?.floor, 255)
})

test('public-first attempt releases protection, and a new day protects it again against period exhaustion', async () => {
  const h = await harness({ env: { NBA_BROWSER_DAILY_SESSION_LIMIT: '10', NBA_BROWSER_MONTHLY_SESSION_LIMIT: '3', NBA_BROWSER_DAILY_MINUTE_LIMIT: '50', NBA_BROWSER_MONTHLY_MINUTE_LIMIT: '15' } })
  await h.api.reserveNbaBrowserBudget(h.input)
  await h.api.reserveNbaBrowserBudget({ ...h.input, workflow: 'direct' })
  h.db.date('2026-10-28')
  await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, workflow: 'direct' }), 'quota-limit')
  await h.api.reserveNbaBrowserBudget(h.input)
  assert.equal(h.db.reservations.size, 3)
})

test('each day/period resource independently preserves the public share, and workflow cannot be arbitrary', async () => {
  for (const env of [
    { NBA_BROWSER_DAILY_CENT_LIMIT: '101' }, { NBA_BROWSER_PERIOD_CENT_LIMIT: '101' },
    { NBA_BROWSER_DAILY_SESSION_LIMIT: '1' }, { NBA_BROWSER_MONTHLY_SESSION_LIMIT: '1' },
    { NBA_BROWSER_DAILY_MINUTE_LIMIT: '9' }, { NBA_BROWSER_MONTHLY_MINUTE_LIMIT: '9' },
  ]) {
    const h = await harness({ env })
    await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, workflow: 'direct' }), 'quota-limit')
    assert.equal(h.db.reservations.size, 0)
    assert.equal(h.db.windows.size, 0)
    await h.api.reserveNbaBrowserBudget(h.input)
    assert.equal(h.db.reservations.size, 1)
  }
  for (const workflow of [undefined, '', 'PUBLIC', 'pikkit', ['public']]) {
    const h = await harness()
    await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, workflow: workflow as never }), 'configuration')
    assert.equal(h.metrics().reads, 0)
  }
})

test('October29 reviewed scope accepts exact public subsets', async () => {
  for (const gameIds of [[21717987], [21717988, 21717989], [21717987, 21717988, 21717989]]) {
    const h = await harness({ rpc: args => ({ allowed: true, reason: 'reserved', id: args.p_id,
      reservedMinutes: 5, reservedCents: 51, day: '2026-10-29', periodStart: '2026-10-18',
      allowanceKey: 'nba-public-count-recovery-2026-10-29', allowanceExpiresAt: '2026-10-30T00:00:00.000Z' }) });
    const result = await h.api.reserveNbaBrowserBudget({ ...h.input, gameIds });
    assert.equal(result.allowanceKey, 'nba-public-count-recovery-2026-10-29');
  }
});
test('October29 reviewed scope rejects mixed IDs, direct, wrong day/key/expiry and missing scope', async () => {
  const cases = [
    { ids: [21717987, 21717990] }, { ids: [21717986] }, { ids: undefined }, { ids: [] },
    { ids: [21717987], workflow: 'direct' }, { ids: [21717987], day: '2026-10-28' },
    { ids: [21717987], key: 'nba-public-count-recovery-2026-10-28' },
    { ids: [21717987], key: 'other' }, { ids: [21717987], expiry: '2026-10-29T00:00:00.000Z' },
    { ids: [21717987], expiry: null }
  ];
  for (const c of cases) {
    const h = await harness({ rpc: args => ({ allowed: true, reason: 'reserved', id: args.p_id,
      reservedMinutes: 5, reservedCents: 51, day: c.day ?? '2026-10-29', periodStart: '2026-10-18',
      allowanceKey: c.key ?? 'nba-public-count-recovery-2026-10-29',
      allowanceExpiresAt: c.expiry === null ? undefined : (c.expiry ?? '2026-10-30T00:00:00.000Z') }) });
    const expected = Array.isArray(c.ids) && !c.ids.length ? 'configuration' : 'reservation-unavailable';
    await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, gameIds: c.ids, workflow: (c.workflow ?? 'public') as 'public' | 'direct' }), expected);
  }
});

test('October30 approved public recovery accepts exact scoped game subsets', async () => {
  for (const gameIds of [[21717990], [21717992, 21717993], [21717998, 21717999, 21718000]]) {
    const h = await harness({ rpc: args => ({ allowed: true, reason: 'reserved', id: args.p_id,
      reservedMinutes: 5, reservedCents: 51, day: '2026-10-30', periodStart: '2026-10-18',
      allowanceKey: 'nba-public-count-recovery-2026-10-30', allowanceExpiresAt: '2026-10-30T23:00:00.000Z' }) })
    assert.equal((await h.api.reserveNbaBrowserBudget({ ...h.input, gameIds })).allowanceKey, 'nba-public-count-recovery-2026-10-30')
  }
})
test('October30 approved recovery rejects wrong game, workflow, day, key, expiry and missing scope', async () => {
  const cases = [
    { ids: [21717990, 21717991] }, { ids: [21717991] }, { ids: undefined }, { ids: [] },
    { ids: [21717990], workflow: 'direct' }, { ids: [21717990], day: '2026-10-29' },
    { ids: [21717990], key: 'other' }, { ids: [21717990], expiry: '2026-10-31T00:00:00.000Z' },
    { ids: [21717990], expiry: null },
  ]
  for (const c of cases) {
    const h = await harness({ rpc: args => ({ allowed: true, reason: 'reserved', id: args.p_id,
      reservedMinutes: 5, reservedCents: 51, day: c.day ?? '2026-10-30', periodStart: '2026-10-18',
      allowanceKey: c.key ?? 'nba-public-count-recovery-2026-10-30',
      allowanceExpiresAt: c.expiry === null ? undefined : (c.expiry ?? '2026-10-30T23:00:00.000Z') }) })
    const expected = Array.isArray(c.ids) && !c.ids.length ? 'configuration' : 'reservation-unavailable'
    await rejectsCode(h.api.reserveNbaBrowserBudget({ ...h.input, gameIds: c.ids, workflow: (c.workflow ?? 'public') as 'public' | 'direct' }), expected)
  }
})
