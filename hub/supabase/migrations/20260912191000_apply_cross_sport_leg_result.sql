create or replace function public.apply_sport_leg_result_to_post(
  p_post_id uuid,
  p_player_key text,
  p_pick_type text,
  p_result text
)
returns table(leg_player_name text, leg_headshot_url text, overall_result text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_pick_data jsonb;
  v_leg jsonb;
  v_new_legs jsonb := '[]'::jsonb;
  v_out_player_name text;
  v_out_headshot_url text;
  v_all_graded boolean := true;
  v_any_loss boolean := false;
  v_all_push boolean := true;
  v_overall text;
  v_was_final boolean;
begin
  select pick_data into v_pick_data from public.posts where id = p_post_id for update;
  if v_pick_data is null then return; end if;

  if jsonb_typeof(v_pick_data -> 'legs') = 'array' then
    v_was_final := coalesce(v_pick_data ->> 'result', 'pending') <> 'pending';
    for v_leg in select * from jsonb_array_elements(v_pick_data -> 'legs') loop
      if coalesce(v_leg ->> 'player_id', v_leg ->> 'mlb_id') = p_player_key
        and v_leg ->> 'prop_key' = p_pick_type
        and coalesce(v_leg ->> 'result', 'pending') = 'pending'
      then
        v_out_player_name := v_leg ->> 'player_name';
        v_out_headshot_url := v_leg ->> 'headshot_url';
        v_leg := jsonb_set(v_leg, '{result}', to_jsonb(p_result));
      end if;
      v_new_legs := v_new_legs || jsonb_build_array(v_leg);
      if coalesce(v_leg ->> 'result', 'pending') = 'pending' then v_all_graded := false; end if;
      if v_leg ->> 'result' = 'loss' then v_any_loss := true; end if;
      if v_leg ->> 'result' <> 'push' then v_all_push := false; end if;
    end loop;
    if v_all_graded then
      v_overall := case when v_any_loss then 'loss' when v_all_push then 'push' else 'win' end;
      if not v_was_final then overall_result := v_overall; end if;
    else
      v_overall := coalesce(v_pick_data ->> 'result', 'pending');
    end if;
    update public.posts set pick_data = jsonb_set(jsonb_set(v_pick_data, '{legs}', v_new_legs), '{result}', to_jsonb(v_overall)) where id = p_post_id;
  else
    v_out_player_name := v_pick_data ->> 'player_name';
    v_out_headshot_url := v_pick_data ->> 'headshot_url';
    overall_result := p_result;
    update public.posts set pick_data = jsonb_set(v_pick_data, '{result}', to_jsonb(p_result)) where id = p_post_id;
  end if;
  leg_player_name := v_out_player_name;
  leg_headshot_url := v_out_headshot_url;
  return next;
end;
$$;

revoke all on function public.apply_sport_leg_result_to_post(uuid,text,text,text) from public;
grant execute on function public.apply_sport_leg_result_to_post(uuid,text,text,text) to service_role;
