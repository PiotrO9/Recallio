alter table public.user_settings
  add column timezone_changes jsonb,
  add constraint user_settings_timezone_changes_array
    check (jsonb_typeof(timezone_changes) = 'array');
