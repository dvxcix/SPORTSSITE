-- Local fixture scaffold only; never run against a live project.
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.users(id uuid primary key);
create table public.groups(id uuid primary key);
create table public.creator_products(id uuid primary key);
insert into users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
grant usage on schema public,auth to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
