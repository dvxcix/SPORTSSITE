-- Run with a privileged SQL connection. Every test write rolls back.
begin;

select set_config('request.jwt.claim.sub',(select id::text from public.users where account_type='user' limit 1),true);
set local role authenticated;
do $test$
declare n integer; col text;
begin
  foreach col in array array['account_type','tier','admin_granted_tier','beta_access_active','discord_advanced_claimed','whop_user_id','verified_identities'] loop
    begin
      execute format('update public.users set %I = %I where false',col,col);
      raise exception 'Security failure: client can write %', col;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    insert into public.users (id,email,username,account_type,tier) values (auth.uid(),'security-test@invalid.example','security-test','admin','ultimate');
    raise exception 'Security failure: client insert allowed';
  exception when insufficient_privilege then null;
  end;
  update public.users set bio=bio where id=auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Own profile edit failed: %', n; end if;
  update public.users set bio=bio where id <> auth.uid();
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Cross-user edit allowed'; end if;
end;
$test$;
reset role;
set local role service_role;
update public.users set tier=tier,account_type=account_type where false;
reset role;
select 'PASS: protected updates/inserts blocked; own profile edit allowed; cross-user edit blocked; trusted updates allowed' as result;

rollback;
