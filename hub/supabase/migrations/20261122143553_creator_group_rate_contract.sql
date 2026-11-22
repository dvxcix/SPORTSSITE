-- Use the existing, explicitly allowed group-creation rate contract.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.create_community_group(text,text,text,text,text,boolean,uuid)'::regprocedure) into definition;
 if position('private.check_rate_limit(''community-create:''||v_user_id::text,10,3600)' in definition)=0
 then raise exception 'Unexpected community creation baseline'; end if;
 execute replace(definition,'private.check_rate_limit(''community-create:''||v_user_id::text,10,3600)','private.check_rate_limit(''group-create:''||v_user_id::text,5,3600)');
end $$;
