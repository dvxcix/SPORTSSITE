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


// Shared SQL tests exercise money enforcement. Legacy sport-limit environment
// settings cannot impose a hidden, lower NBA spending or session ceiling.
test('NBA atomic configuration ignores old sport caps and retains scope bounds', async () => {
  const h = await harness({ env: { NBA_BROWSER_DAILY_CENT_LIMIT: '1', NBA_BROWSER_PERIOD_CENT_LIMIT: '1', NBA_BROWSER_DAILY_SESSION_LIMIT: '1', NBA_BROWSER_MONTHLY_SESSION_LIMIT: '1', NBA_BROWSER_DAILY_MINUTE_LIMIT: '1', NBA_BROWSER_MONTHLY_MINUTE_LIMIT: '1' } })
  const c = h.api.nbaBrowserAtomicConfiguration({ ...h.input, timeoutSeconds: 300, gameIds: [21717988, 21717987] })
  assert.equal(c.dailySessions, 1000); assert.equal(c.monthlySessions, 10000)
  assert.equal(c.dailyMinutes, 30000); assert.equal(c.monthlyMinutes, 30000)
  assert.deepEqual(c.gameIds, [21717987, 21717988]); assert.equal(c.resetDay, 18)
  assert.equal(h.metrics().reads, 0); assert.equal(h.calls.length, 0)
})

test('NBA atomic configuration rejects disabled, invalid identity, reset day and timeout', async () => {
  for (const value of [undefined, 'false', 'TRUE', '1', ' true ']) {
    const h = await harness({ env: { NBA_BROWSER_CAPTURE_ENABLED: value } })
    assert.throws(() => h.api.nbaBrowserAtomicConfiguration({ ...h.input, timeoutSeconds: 300 }), { code: 'paused' })
  }
  for (const value of [undefined, '', ' ', '0', '-1', '1e3', '1.5', '12oops', '29', '999999999999999999']) {
    const h = await harness({ env: { NBA_BROWSER_BUDGET_RESET_DAY: value } })
    assert.throws(() => h.api.nbaBrowserAtomicConfiguration({ ...h.input, timeoutSeconds: 300 }), { code: 'configuration' })
  }
  const h = await harness()
  for (const timeoutSeconds of [0, 59, 301, 450, NaN, Infinity, 60.5])
    assert.throws(() => h.api.nbaBrowserAtomicConfiguration({ ...h.input, timeoutSeconds }), { code: 'configuration' })
  for (const projectId of ['', '../bad', 'a'.repeat(129)])
    assert.throws(() => h.api.nbaBrowserAtomicConfiguration({ ...h.input, projectId, timeoutSeconds: 300 }), { code: 'configuration' })
  for (const workflow of [undefined, '', 'PUBLIC', 'pikkit', ['public']])
    assert.throws(() => h.api.nbaBrowserAtomicConfiguration({ ...h.input, workflow: workflow as never, timeoutSeconds: 300 }), { code: 'configuration' })
  assert.equal(h.metrics().reads, 0); assert.equal(h.calls.length, 0)
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

test('October31 exact public subsets admitted', async () => {
  for (const gameIds of [[21718001],[21718002,21718007],[21718001,21718002,21718003,21718004,21718005,21718006,21718007]]) {
    const h=await harness({rpc:args=>({allowed:true,reason:'reserved',id:args.p_id,reservedMinutes:5,reservedCents:51,day:'2026-10-31',periodStart:'2026-10-18',allowanceKey:'nba-public-count-recovery-2026-10-31',allowanceExpiresAt:'2026-10-31T19:00:00.000Z'})});
    assert.equal((await h.api.reserveNbaBrowserBudget({...h.input,gameIds})).allowanceKey,'nba-public-count-recovery-2026-10-31');
  }
});
test('October31 rejects mixed IDs, wrong workflow, key, day, expiry and absent scope', async () => {
  const cases=[{ids:[21718001,21718008]},{ids:[21718000]},{ids:undefined},{ids:[]},{ids:[21718001],workflow:'direct'},{ids:[21718001],day:'2026-10-30'},{ids:[21718001],key:'unreviewed'},{ids:[21718001],expiry:'2026-10-31T20:00:00.000Z'},{ids:[21718001],expiry:null}];
  for(const c of cases){const h=await harness({rpc:args=>({allowed:true,reason:'reserved',id:args.p_id,reservedMinutes:5,reservedCents:51,day:c.day??'2026-10-31',periodStart:'2026-10-18',allowanceKey:c.key??'nba-public-count-recovery-2026-10-31',allowanceExpiresAt:c.expiry===null?undefined:(c.expiry??'2026-10-31T19:00:00.000Z')})});
    await rejectsCode(h.api.reserveNbaBrowserBudget({...h.input,gameIds:c.ids,workflow:(c.workflow??'public') as 'public'|'direct'}),Array.isArray(c.ids)&&!c.ids.length?'configuration':'reservation-unavailable');}
});
