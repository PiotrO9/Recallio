create role recallio_backend nologin noinherit;

create function recallio_private.account_id() returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(current_setting('recallio.user_id', true), '')::uuid;
$$;

create table recallio_private.snapshots (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  watermark bigint not null check (watermark >= 0),
  pages jsonb not null check (jsonb_typeof(pages) = 'array'),
  expires_at timestamptz not null,
  primary key (user_id, id)
);
create index snapshots_account_expiry_idx on recallio_private.snapshots (user_id, expires_at);
alter table recallio_private.snapshots enable row level security;

grant usage on schema public, recallio_private to recallio_backend;
grant select, insert, update on public.user_settings, public.decks, public.cards, public.progress
  to recallio_backend;
grant select, insert on public.review_events, public.introductions to recallio_backend;
grant select, insert, update on recallio_private.sync_heads to recallio_backend;
grant select, insert on recallio_private.progress_resets, recallio_private.change_log,
  recallio_private.operation_receipts to recallio_backend;
grant select, insert, delete on recallio_private.snapshots to recallio_backend;

do $$
declare
  relation regclass;
begin
  foreach relation in array array[
    'public.user_settings', 'public.decks', 'public.cards', 'public.progress',
    'public.review_events', 'public.introductions', 'recallio_private.sync_heads',
    'recallio_private.progress_resets', 'recallio_private.change_log',
    'recallio_private.operation_receipts', 'recallio_private.snapshots'
  ]::regclass[]
  loop
    execute format(
      'create policy backend_account on %s for all to recallio_backend
        using (user_id = (select recallio_private.account_id()))
        with check (user_id = (select recallio_private.account_id()))',
      relation
    );
  end loop;
end $$;

-- Each successful mutation holds this row lock through changes and receipt commit.
create function recallio_private.lock_sync_account() returns bigint
language plpgsql
set search_path = ''
as $$
declare
  account uuid := recallio_private.account_id();
  head bigint;
begin
  if account is null then
    raise exception 'Missing account context' using errcode = '42501';
  end if;
  insert into recallio_private.sync_heads (user_id) values (account)
    on conflict (user_id) do nothing;
  select last_sequence into strict head
    from recallio_private.sync_heads where user_id = account for update;
  return head;
end;
$$;

create function recallio_private.next_sync_cursor() returns bigint
language sql
set search_path = ''
as $$
  update recallio_private.sync_heads
  set last_sequence = last_sequence + 1
  where user_id = recallio_private.account_id()
  returning last_sequence;
$$;

revoke all on function recallio_private.account_id(),
  recallio_private.lock_sync_account(), recallio_private.next_sync_cursor()
  from public, anon, authenticated, service_role;
grant execute on function recallio_private.account_id(),
  recallio_private.lock_sync_account(), recallio_private.next_sync_cursor()
  to recallio_backend;
