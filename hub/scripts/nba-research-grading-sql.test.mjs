// Local PostgreSQL fixture only. Uses the existing review-workspace PGlite or
// PGLITE_MODULE pointing to its ESM entry; never connects to a live database.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const moduleUrl = process.env.PGLITE_MODULE
  ? pathToFileURL(process.env.PGLITE_MODULE).href
  : new URL('../../work/db-repair-tools/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url).href
const { PGlite } = await import(moduleUrl)
const read = async name => (await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')).replaceAll('\r\n', '\n')
const validation = await read('20261019054602_nba_research_validation.sql')
const appearance = await read('20261019060559_nba_appearance_evidence.sql')
const extended = await read('20261019063701_nba_extended_market_semantics.sql')
const migration = await read('20261019231441_nba_research_grading_indexed_pending.sql')
function functionSql(source, name) {
  const start = source.indexOf(`create or replace function public.${name}(`)
  assert.ok(start >= 0, name)
  const end = source.indexOf('$$;', source.indexOf('as $$', start))
  assert.ok(end > start, name)
  return source.slice(start, end + 3)
}
const oldGrader = functionSql(extended, 'grade_nba_research_snapshots')
const query = migration.slice(migration.indexOf('with pending as materialized'), migration.indexOf(') update public.nba_research_snapshots'))
  + ') select * from eligible'

test('indexed research grader preserves outcomes and avoids history-wide work', async t => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create table nba_games(id bigint primary key,season integer not null,payload jsonb default '{}');
      create table nba_player_game_stats(game_id bigint,player_id bigint,season integer,postseason boolean,payload jsonb,unique(player_id,game_id));
      create index nba_stats_game_player on nba_player_game_stats(game_id,player_id);
      create table nba_player_period_stats(game_id bigint,player_id bigint,season integer,postseason boolean,period integer check(period between 1 and 4),payload jsonb,unique(player_id,game_id,period));
      create index nba_period_game on nba_player_period_stats(game_id,period,player_id);
      create table nba_research_snapshots(id bigint generated always as identity primary key,game_id bigint,player_id bigint,market text,status text default 'pending',estimate numeric,actual_value numeric,absolute_error numeric,graded_at timestamptz);
      create index nba_research_snapshot_pending on nba_research_snapshots(game_id) where status='pending';
      grant select on nba_games,nba_player_game_stats,nba_player_period_stats to service_role;
      grant select,update on nba_research_snapshots to service_role;
      alter table nba_research_snapshots enable row level security;
    `)
    await db.exec(functionSql(validation, 'nba_stat_minutes'))
    await db.exec(functionSql(appearance, 'nba_stat_appeared'))
    await db.exec(functionSql(extended, 'nba_stat_market_value'))
    await db.exec(oldGrader)
    await db.exec('revoke all on function grade_nba_research_snapshots(integer) from public,anon,authenticated; grant execute on function grade_nba_research_snapshots(integer) to service_role;')
    await t.test('exact live-definition guard and existing service-only privileges survive replacement', async () => {
      assert.equal((await db.query("select md5(pg_get_functiondef('grade_nba_research_snapshots(integer)'::regprocedure)) hash")).rows[0].hash, 'a4f3cd3fcc2bf662eea5af22de1aacbc')
      await db.exec(migration)
      for (const role of ['anon', 'authenticated']) {
        assert.equal((await db.query("select has_function_privilege($1,'grade_nba_research_snapshots(integer)','execute') allowed", [role])).rows[0].allowed, false)
      }
      assert.equal((await db.query("select has_function_privilege('service_role','grade_nba_research_snapshots(integer)','execute') allowed")).rows[0].allowed, true)
      assert.equal((await db.query("select prosecdef from pg_proc where oid='grade_nba_research_snapshots(integer)'::regprocedure")).rows[0].prosecdef, false)
      await assert.rejects(db.exec(migration), /grader changed/)
      await assert.rejects(db.query('select grade_nba_research_snapshots(0)'), /Invalid NBA grade batch/)
      await assert.rejects(db.query('select grade_nba_research_snapshots(10001)'), /Invalid NBA grade batch/)
    })
    const stat = (extra = {}) => ({ min: '30', pts: 23, reb: 12, ast: 10, fg3m: 3, stl: 1, blk: 0, turnover: 2, game: { status_state: 'final' }, ...extra })
    const fact = async (game, player, extra = {}, options = {}) => {
      const table = options.period ? 'nba_player_period_stats' : 'nba_player_game_stats'
      const payload = stat({ ...(options.period ? { period: options.period } : {}), ...extra })
      await db.query(`insert into ${table}(game_id,player_id,season,postseason,payload${options.period ? ',period' : ''}) values($1,$2,$3,$4,$5${options.period ? ',$6' : ''})`, [game, player, options.season ?? 2026, options.postseason ?? false, payload, ...(options.period ? [options.period] : [])])
    }
    const snapshot = async (game, player, market = 'points', estimate = null) => {
      return (await db.query('insert into nba_research_snapshots(game_id,player_id,market,estimate) values($1,$2,$3,$4) returning id', [game, player, market, estimate])).rows[0].id
    }
    await db.exec("insert into nba_games(id,season,payload) select n,2026,'{\"status_state\":\"scheduled\"}' from generate_series(1,30)n")
    await t.test('same eligible set as original: final stat truth, period provenance, binary markets and incomplete evidence', async () => {
      // Earlier future observations exceed the batch cap; eligible later rows must still settle.
      await db.exec("insert into nba_research_snapshots(game_id,player_id,market) select 1,1,'points' from generate_series(1,20)")
      await fact(2, 2)
      await fact(2, 2, { pts: 7, reb: 3, ast: 2 }, { period: 1 })
      const points = await snapshot(2, 2, 'points', 20)
      const q1 = await snapshot(2, 2, 'points_1q', 8)
      const combo = await snapshot(2, 2, 'points_rebounds_assists')
      const double = await snapshot(2, 2, 'double_double')
      const triple = await snapshot(2, 2, 'triple_double')
      await fact(3, 3, { min: '0', pts: 0, reb: 0, ast: 0, fg3m: 0, stl: 0, blk: 0, turnover: 0 })
      await snapshot(3, 3) // No appearance; no forced DNP or zero outcome.
      await fact(4, 4, { min: '0', pts: 2 })
      const brief = await snapshot(4, 4) // Rounded zero minutes with evidence is an appearance.
      await fact(5, 5, { min: null }); await snapshot(5, 5)
      await fact(6, 6, { game: { status: 'In Progress' } }); await snapshot(6, 6)
      await fact(7, 7, {}, { season: 2025 }); await snapshot(7, 7)
      await fact(8, 8, {}, { postseason: true }); await snapshot(8, 8)
      await fact(9, 9, { ast: null }); await snapshot(9, 9, 'points_assists')
      await fact(10, 10); await snapshot(10, 10, 'points_1q') // No full-game proxy for missing Q1.
      await fact(11, 11, { pts: 99 }, { period: 2 }); await snapshot(11, 11, 'points_1q')
      await fact(12, 12, { game: { status: 'Final' } }); const legacyFinal = await snapshot(12, 12)
      await fact(13, 13, { period: 1 }); await snapshot(13, 13) // Malformed full-game provenance stays unknown.
      await fact(14, 14, { pts: 1, reb: 1, ast: 1, stl: null, blk: null }); await snapshot(14, 14, 'double_double')
      await fact(15, 15, { pts: 1, reb: 1, ast: 1, stl: 0, blk: 0 }); const noDouble = await snapshot(15, 15, 'double_double')
      await db.exec(oldGrader.replaceAll('public.grade_nba_research_snapshots(', 'public.grade_nba_research_snapshots_baseline('))
      await db.exec('begin')
      await db.query('select grade_nba_research_snapshots_baseline(10000)')
      const before = (await db.query("select id,status,actual_value,absolute_error from nba_research_snapshots where status='final' order by id")).rows
      await db.exec('rollback')
      await db.exec('set role service_role')
      assert.equal((await db.query('select grade_nba_research_snapshots(2) n')).rows[0].n, 2)
      await db.exec('reset role')
      assert.deepEqual((await db.query("select id,actual_value,absolute_error from nba_research_snapshots where status='final' order by id")).rows, [
        { id: points, actual_value: '23', absolute_error: '3' }, { id: q1, actual_value: '7', absolute_error: '1' },
      ])
      assert.equal((await db.query('select grade_nba_research_snapshots(10000) n')).rows[0].n, 6)
      const after = (await db.query("select id,status,actual_value,absolute_error from nba_research_snapshots where status='final' order by id")).rows
      assert.deepEqual(after, before)
      assert.deepEqual(after.map(row => row.id), [points, q1, combo, double, triple, brief, legacyFinal, noDouble])
      assert.deepEqual(after.map(row => row.actual_value), ['23', '7', '45', '1', '1', '2', '23', '0'])
      assert.equal((await db.query('select grade_nba_research_snapshots(10000) n')).rows[0].n, 0)
    })
    await t.test('large future capture backlog performs only indexed fact lookups, never a history-wide stat scan', async () => {
      await db.exec(`truncate nba_research_snapshots restart identity; truncate nba_player_game_stats,nba_player_period_stats;
        insert into nba_player_game_stats select 100000+n,n,2025,false,'{"min":"30","pts":1,"game":{"status":"Final"}}' from generate_series(1,30000)n;
        insert into nba_player_period_stats select 100000+n,n,2025,false,1,'{"min":"8","pts":1,"period":1,"game":{"status":"Final"}}' from generate_series(1,30000)n;
        insert into nba_research_snapshots(game_id,player_id,market) select 1+(n%3),1+(n%60),case when n%2=0 then 'points' else 'points_1q' end from generate_series(1,27345)n;
        analyze nba_games; analyze nba_research_snapshots; analyze nba_player_game_stats; analyze nba_player_period_stats;`)
      const plan = (await db.query(`explain (analyze,format json) ${query.replace('limit p_limit', 'limit 5000')}`)).rows[0]['QUERY PLAN'][0]
      const nodes = []
      const visit = node => { nodes.push(node); for (const child of node.Plans ?? []) visit(child) }
      visit(plan.Plan)
      const scans = nodes.filter(node => ['nba_player_game_stats', 'nba_player_period_stats'].includes(node['Relation Name']))
      assert.equal(scans.length, 2)
      for (const scan of scans) {
        assert.match(scan['Node Type'], /Index/)
        assert.ok(scan['Actual Loops'] <= 60, JSON.stringify(scan))
        assert.equal(scan['Actual Rows'], 0)
      }
      assert.equal(plan.Plan['Actual Rows'], 0)
      assert.equal((await db.query('select grade_nba_research_snapshots(5000) n')).rows[0].n, 0)
      assert.equal((await db.query("select count(*)::int n from nba_research_snapshots where status='pending'")).rows[0].n, 27345)
      t.diagnostic(`27,345 pending captures / 60,000 unrelated historical facts: ${plan['Execution Time']}ms; exact-key index scans only`)
    })
  } finally { await db.close() }
})
