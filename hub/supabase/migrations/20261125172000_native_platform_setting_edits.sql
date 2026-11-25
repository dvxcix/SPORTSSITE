-- Native edits compare the original value atomically, including nullable rows.
-- The caller retains the existing site_settings RLS policy.
create or replace function public.save_native_platform_setting(
  setting_key text, had_row boolean, previous_value text, new_value text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if setting_key is null or setting_key not in (
    'site_name', 'site_tagline', 'site_email', 'allow_registration', 'email_verification',
    'maintenance_mode', 'max_post_length', 'posts_per_page', 'custom_css', 'custom_js', 'custom_head_html'
  ) or had_row is null or new_value is null or length(new_value) > 65536
    or (not had_row and previous_value is not null)
  then
    return false;
  end if;

  if had_row then
    update public.site_settings
      set value = new_value, updated_at = now()
      where key = setting_key and value is not distinct from previous_value;
  else
    insert into public.site_settings (key, value, updated_at)
      values (setting_key, new_value, now()) on conflict (key) do nothing;
  end if;
  return found;
end;
$$;

revoke all on function public.save_native_platform_setting(text, boolean, text, text) from public, anon;
grant execute on function public.save_native_platform_setting(text, boolean, text, text) to authenticated;
