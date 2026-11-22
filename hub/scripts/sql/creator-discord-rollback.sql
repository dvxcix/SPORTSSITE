-- Transaction-only verification: no provider calls, messages, payments, real Discord roles or durable fixtures.
begin;
set local statement_timeout='25s';
select set_config('slipsurge.verify_owner',(select id::text from public.users where lower(username)='slipsurge' limit 1),true);
select set_config('slipsurge.verify_buyer',(select id::text from public.users where account_type='user' and lower(username)<>'slipsurge' order by created_at limit 1),true);
set local role service_role;
do $$
declare owner_id uuid:=current_setting('slipsurge.verify_owner')::uuid;buyer uuid:=current_setting('slipsurge.verify_buyer')::uuid;
 product uuid;space uuid;integration uuid;job public.creator_discord_jobs%rowtype;stamp timestamptz:=now();allowed jsonb;claimed integer;
begin
 if owner_id is null or buyer is null then raise exception 'Fixture identities unavailable';end if;
 if has_table_privilege('authenticated','public.creator_discord_integrations','INSERT') or has_table_privilege('anon','public.creator_discord_jobs','SELECT') or has_function_privilege('authenticated','public.configure_creator_discord(uuid,uuid,text,text,text,text,text)','EXECUTE') or has_function_privilege('service_role','public.creator_admin_update_fee(uuid,numeric,timestamptz)','EXECUTE') then raise exception 'Server ownership boundary failed';end if;
 update public.users set whop_connected_company_id='biz_discordfixture' where id=owner_id;
 update public.users set discord_id='123456789012345677' where id=buyer;
 insert into public.creator_products(creator_id,title,price,platform_fee_amount,status,product_type,whop_plan_id) values(owner_id,'Discord transaction fixture',20,0,'draft','membership','plan_discordfixture') returning id into product;
 insert into public.groups(owner_id,name,slug,is_public,access_type,creator_product_id) values(owner_id,'Discord transaction fixture','discord-transaction-fixture-20261122',false,'paid',product) returning id into space;
 begin perform public.configure_creator_discord(buyer,space,'123456789012345678','Fixture','123456789012345679','Members',null);raise exception 'Non-owner configuration accepted';exception when insufficient_privilege then null;end;
 integration:=public.configure_creator_discord(owner_id,space,'123456789012345678','Fixture','123456789012345679','Members',null);
 allowed:=public.creator_discord_access(integration,buyer);if (allowed->>'allowed')::boolean then raise exception 'Unpaid role access allowed';end if;
 perform public.apply_creator_membership('discord-fixture-active','membership.activated',product,owner_id,buyer,'mem_discordfixture','mem_discordfixture','biz_discordfixture','plan_discordfixture','active',now()+interval '1 day',stamp);
 allowed:=public.creator_discord_access(integration,buyer);if not (allowed->>'allowed')::boolean then raise exception 'Current member denied';end if;
 select count(*) into claimed from public.claim_creator_discord_jobs(1,buyer,integration);if claimed<>1 then raise exception 'Role job was not claimed';end if;
 select * into job from public.creator_discord_jobs where integration_id=integration and user_id=buyer;
 select count(*) into claimed from public.claim_creator_discord_jobs(1,buyer,integration);if claimed<>0 then raise exception 'Delivery lease did not prevent duplicate processing';end if;
 perform public.apply_creator_membership('discord-fixture-same','membership.updated',product,owner_id,buyer,'mem_discordfixture','mem_discordfixture','biz_discordfixture','plan_discordfixture','active',now()+interval '1 day',stamp);
 if exists(select 1 from public.creator_discord_jobs where id=job.id and version<>job.version) then raise exception 'Unchanged verification requeued itself';end if;
 perform public.queue_creator_discord(space,buyer);
 perform public.finish_creator_discord_job(job.id,job.version,true,'123456789012345677');
 if not exists(select 1 from public.creator_discord_jobs where id=job.id and pending and locked_until is null) then raise exception 'Newer access version was lost';end if;
 select * into job from public.claim_creator_discord_jobs(1,buyer,integration);
 perform public.finish_creator_discord_job(job.id,job.version,false,null);
 if not exists(select 1 from public.creator_discord_jobs where id=job.id and attempts=1 and pending and run_after>now()) then raise exception 'Discord failure was not retained for retry';end if;
 -- Admin holds and late activations cannot add membership side effects.
 update public.creator_entitlements set admin_revoked_at=now() where product_id=product and user_id=buyer;
 delete from public.group_members where group_id=space and user_id=buyer;
 perform public.apply_creator_membership('discord-fixture-held','membership.updated',product,owner_id,buyer,'mem_discordfixture','mem_discordfixture','biz_discordfixture','plan_discordfixture','active',now()+interval '1 day',stamp+interval '1 second');
 if exists(select 1 from public.group_members where group_id=space and user_id=buyer) then raise exception 'Held membership re-enrolled';end if;
 allowed:=public.creator_discord_access(integration,buyer);if (allowed->>'allowed')::boolean then raise exception 'Held role access allowed';end if;
 update public.creator_entitlements set admin_revoked_at=null where product_id=product and user_id=buyer;
 perform public.apply_creator_membership('discord-fixture-expired','membership.deactivated',product,owner_id,buyer,'mem_discordfixture','mem_discordfixture','biz_discordfixture','plan_discordfixture','expired',now()-interval '1 day',stamp+interval '3 seconds');
 perform public.apply_creator_membership('discord-fixture-late','membership.activated',product,owner_id,buyer,'mem_discordfixture','mem_discordfixture','biz_discordfixture','plan_discordfixture','active',now()+interval '1 day',stamp+interval '2 seconds');
 if exists(select 1 from public.group_members where group_id=space and user_id=buyer) or exists(select 1 from public.creator_entitlements where product_id=product and user_id=buyer and status<>'expired') then raise exception 'Late activation overrode expiry';end if;
 perform public.configure_creator_discord(owner_id,space,null,null,null,null,null);
 allowed:=public.creator_discord_access(integration,buyer);if (allowed->>'allowed')::boolean then raise exception 'Disconnected integration still allows roles';end if;
 delete from public.groups where id=space;
 if not exists(select 1 from public.creator_discord_integrations where id=integration and group_id is null) or not exists(select 1 from public.creator_discord_jobs where integration_id=integration and assigned_discord_id is not null and pending) then raise exception 'Group deletion lost role cleanup';end if;
end $$;
reset role;
rollback;
