// Explicit maintenance/backfill runner; uses the same functions as production cron.
import { createClient } from '@supabase/supabase-js'
import { syncNflGameEvents, syncNflAuxiliary } from '../src/lib/nflGameFeeds'
import { syncNflPlayerStats } from '../src/lib/nflverseSync'
const season=Number(process.argv[2])
if(!Number.isInteger(season)||season<2025||season>new Date().getUTCFullYear()) throw new Error('Pass a valid season')
const url=process.env.NEXT_PUBLIC_SUPABASE_URL
const key=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!url||!key||new URL(url).hostname!=='hkldweedwnxartkfhror.supabase.co') throw new Error('Expected configured production Supabase')
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
console.log('weeklyStats',await syncNflPlayerStats(db,season))
console.log('auxiliary',JSON.stringify(await syncNflAuxiliary(db,season)))
for(let batch=0;batch<5;batch++) console.log('events',JSON.stringify(await syncNflGameEvents(db,season)))
