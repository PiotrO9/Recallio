create schema recallio_private;
revoke all on schema recallio_private from public, anon, authenticated;

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null check (char_length(timezone) between 1 and 100),
  new_limit integer not null check (new_limit between 0 and 10000),
  show_due boolean not null,
  show_session boolean not null,
  revision bigint not null check (revision >= 0)
);

create table public.decks (
  user_id uuid not null references auth.users (id) on delete cascade,
  id uuid not null,
  name text not null check (char_length(name) between 1 and 120 and name ~ '[^[:space:]]'),
  direction_mode text not null check (direction_mode in ('a-b', 'b-a', 'mixed')),
  revision bigint not null check (revision >= 0),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table public.cards (
  user_id uuid not null,
  id uuid not null,
  deck_id uuid not null,
  side_a text not null check (char_length(side_a) between 1 and 4000 and side_a ~ '[^[:space:]]'),
  side_b text not null check (char_length(side_b) between 1 and 4000 and side_b ~ '[^[:space:]]'),
  example_a text check (char_length(example_a) <= 8000),
  example_b text check (char_length(example_b) <= 8000),
  revision bigint not null check (revision >= 0),
  deleted_at timestamptz,
  primary key (user_id, id),
  foreign key (user_id, deck_id) references public.decks (user_id, id) on delete cascade
);
create index cards_user_deck_idx on public.cards (user_id, deck_id);

create table public.review_events (
  user_id uuid not null,
  id uuid not null,
  card_id uuid not null,
  direction text not null check (direction in ('a-b', 'b-a')),
  epoch bigint not null check (epoch >= 0),
  rating smallint not null check (rating between 1 and 4),
  observed_mode text not null check (observed_mode in ('introduction', 'due', 'practice')),
  canonical_mode text check (canonical_mode in ('introduction', 'due', 'practice')),
  device_id uuid not null,
  client_seq bigint not null check (client_seq >= 0),
  occurred_at timestamptz not null,
  received_at timestamptz not null,
  effective_at timestamptz,
  observed_content_revision bigint not null check (observed_content_revision >= 0),
  observed_progress_revision bigint check (observed_progress_revision >= 0),
  algorithm_version text not null check (char_length(algorithm_version) between 1 and 100),
  disposition text not null check (disposition in ('applied', 'ignored_deleted', 'ignored_old_epoch')),
  check (
    (disposition = 'applied' and effective_at is not null and canonical_mode is not null)
    or (disposition <> 'applied' and effective_at is null and canonical_mode is null)
  ),
  primary key (user_id, id),
  unique (user_id, device_id, client_seq),
  foreign key (user_id, card_id) references public.cards (user_id, id) on delete cascade
);
create index review_events_card_direction_idx
  on public.review_events (user_id, card_id, direction, effective_at, id);

create table public.progress (
  user_id uuid not null,
  card_id uuid not null,
  direction text not null check (direction in ('a-b', 'b-a')),
  epoch bigint not null check (epoch >= 0),
  due_at timestamptz not null,
  last_effective_at timestamptz not null,
  scheduler_state jsonb not null,
  algorithm_version text not null check (char_length(algorithm_version) between 1 and 100),
  revision bigint not null check (revision >= 0),
  check (
    jsonb_typeof(scheduler_state) = 'object'
    and scheduler_state ? 'data'
    and (scheduler_state -> 'version' = to_jsonb(algorithm_version)) is true
  ),
  primary key (user_id, card_id, direction),
  foreign key (user_id, card_id) references public.cards (user_id, id) on delete cascade
);
create index progress_due_idx on public.progress (user_id, due_at);

create table public.introductions (
  user_id uuid not null,
  card_id uuid not null,
  first_effective_at timestamptz not null,
  study_day date not null,
  primary key (user_id, card_id),
  foreign key (user_id, card_id) references public.cards (user_id, id) on delete cascade
);

create table recallio_private.progress_resets (
  user_id uuid not null,
  card_id uuid not null,
  direction text not null check (direction in ('a-b', 'b-a')),
  epoch bigint not null check (epoch > 0),
  server_order bigint not null check (server_order > 0),
  primary key (user_id, card_id, direction, epoch),
  foreign key (user_id, card_id) references public.cards (user_id, id) on delete cascade
);

create table recallio_private.sync_heads (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_sequence bigint not null default 0 check (last_sequence >= 0)
);

create table recallio_private.change_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  sequence bigint not null check (sequence > 0),
  entity text not null check (entity in ('deck', 'card', 'progress', 'review', 'reset', 'introduction', 'settings')),
  entity_id uuid not null,
  revision bigint not null check (revision >= 0),
  payload jsonb not null,
  deleted boolean not null default false,
  primary key (user_id, sequence)
);

create table recallio_private.operation_receipts (
  user_id uuid not null references auth.users (id) on delete cascade,
  operation_id uuid not null,
  payload_hash bytea not null check (octet_length(payload_hash) = 32),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);

alter table public.user_settings enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.review_events enable row level security;
alter table public.progress enable row level security;
alter table public.introductions enable row level security;
alter table recallio_private.progress_resets enable row level security;
alter table recallio_private.sync_heads enable row level security;
alter table recallio_private.change_log enable row level security;
alter table recallio_private.operation_receipts enable row level security;

revoke all on public.user_settings, public.decks, public.cards, public.review_events,
  public.progress, public.introductions from public, anon, authenticated, service_role;
grant select on public.user_settings, public.decks, public.cards, public.review_events,
  public.progress, public.introductions to authenticated;

create policy settings_read_own on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy decks_read_own on public.decks for select to authenticated
  using (user_id = (select auth.uid()));

create policy cards_read_own on public.cards for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.decks d where d.user_id = cards.user_id and d.id = cards.deck_id)
  );
create policy reviews_read_own on public.review_events for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.cards c where c.user_id = review_events.user_id and c.id = review_events.card_id)
  );
create policy progress_read_own on public.progress for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.cards c where c.user_id = progress.user_id and c.id = progress.card_id)
  );
create policy introductions_read_own on public.introductions for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.cards c where c.user_id = introductions.user_id and c.id = introductions.card_id)
  );
