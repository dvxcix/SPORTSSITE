import fs from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite()
try {
await db.exec(`
create role anon;create role authenticated;create role service_role bypassrls;
create table users(id uuid primary key,username text,account_type text,created_at timestamptz default now(),discord_id text,whop_connected_company_id text);
create table creator_products(id uuid primary key default gen_random_uuid(),creator_id uuid references users(id),title text,price numeric,platform_fee_amount numeric,status text,product_type text,whop_plan_id text);
create table groups(id uuid primary key default gen_random_uuid(),owner_id uuid references users(id),name text,slug text,is_public boolean,access_type text,creator_product_id uuid references creator_products(id),channel_id uuid);
create table group_members(group_id uuid references groups(id) on delete cascade,user_id uuid references users(id) on delete cascade,role text,primary key(group_id,user_id));
create table channels(id uuid primary key default gen_random_uuid(),creator_product_id uuid references creator_products(id));
create table channel_members(channel_id uuid references channels(id),user_id uuid references users(id),primary key(channel_id,user_id));
create table creator_entitlements(id uuid primary key default gen_random_uuid(),user_id uuid references users(id),creator_id uuid references users(id),product_id uuid references creator_products(id),whop_membership_id text unique,status text,current_period_end timestamptz,provider_updated_at timestamptz,updated_at timestamptz,admin_revoked_at timestamptz,unique(user_id,product_id));
create table creator_commerce_events(id uuid primary key default gen_random_uuid(),creator_id uuid,product_id uuid,event_type text,provider_event_id text unique,provider_object_id text,amount numeric,currency text,status text,metadata jsonb);
create table platform_settings(key text primary key,value jsonb,updated_at timestamptz default now());
insert into platform_settings(key,value)values('fee_independent_creator_pct','10');
create function creator_admin_update_fee(uuid,numeric,timestamptz)returns void language sql as $$ select $$;
revoke all on function creator_admin_update_fee(uuid,numeric,timestamptz) from public,anon,authenticated;
grant execute on function creator_admin_update_fee(uuid,numeric,timestamptz) to service_role;
insert into users(id,username,account_type)values('00000000-0000-4000-8000-000000000001','slipsurge','admin'),('00000000-0000-4000-8000-000000000002','fixture-member','user');
`)
const previous=await fs.readFile('supabase/migrations/20261122164203_creator_business_journey_controls.sql','utf8')
const start=previous.indexOf('create or replace function public.keep_creator_access_hold'),end=previous.indexOf('create or replace function public.creator_admin_update_fee',start)
await db.exec(previous.slice(start,end))
await db.exec(await fs.readFile('supabase/migrations/20261122213606_creator_discord_delivery.sql','utf8'))
await db.exec(await fs.readFile('supabase/migrations/20261122225744_creator_discord_verified_delivery.sql','utf8'))
await db.exec('grant usage on schema public to service_role;grant all on all tables in schema public to service_role;')
await db.exec(await fs.readFile('scripts/sql/creator-discord-rollback.sql','utf8'))
const counts=await db.query('select (select count(*) from creator_products) products,(select count(*) from creator_discord_integrations) integrations,(select count(*) from creator_discord_jobs) jobs')
if(Object.values(counts.rows[0]).some(value=>Number(value)!==0))throw new Error('Rollback left test data')
console.log('PASS: owner-only configuration; unpaid/active/expired/held access; late webhooks; exclusive delivery leases; version fencing; retry backoff; disconnect/deletion cleanup; service-only privileges; complete rollback.')
} catch(error) { console.error(error.message);console.error(error.where||'');process.exitCode=1 } finally { await db.close() }
