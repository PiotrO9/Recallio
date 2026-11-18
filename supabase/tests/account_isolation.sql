begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

insert into auth.users (id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.decks (user_id, id, name, direction_mode, revision) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '10000000-0000-4000-8000-000000000001', 'A', 'a-b', 0),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '10000000-0000-4000-8000-000000000002', 'B', 'b-a', 0);
insert into public.cards (user_id, id, deck_id, side_a, side_b, revision) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001', 'A', 'A2', 0),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002', 'B', 'B2', 0);

select throws_ok(
  $$insert into public.cards (user_id, id, deck_id, side_a, side_b, revision)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000002', 'A', 'A2', 0)$$,
  '23503', null, 'A card must have a deck under the same owner'
);
select throws_ok(
  $$insert into public.introductions (user_id, card_id, first_effective_at, study_day)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '20000000-0000-4000-8000-000000000002',
      '2026-11-18T23:00:00Z', '2026-11-19')$$,
  '23503', null, 'An introduction must have a card under the same owner'
);
select ok(
  not has_schema_privilege('authenticated', 'recallio_private', 'USAGE'),
  'Authenticated clients cannot access private sync tables'
);
select ok(
  not has_table_privilege('service_role', 'public.progress', 'UPDATE'),
  'Data API service role cannot update projections directly'
);
select ok(
  not has_table_privilege('anon', 'public.decks', 'SELECT'),
  'Anonymous clients have no read grant'
);

set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select results_eq(
  $$select name from public.decks order by name$$,
  $$values ('A'::text)$$, 'A reads only decks owned by A'
);
select results_eq(
  $$select side_a from public.cards order by side_a$$,
  $$values ('A'::text)$$, 'A reads only cards with a deck owned by A'
);
select throws_ok(
  $$update public.decks set name = 'New name'$$,
  '42501', null, 'Authenticated clients cannot write decks directly'
);
select throws_ok(
  $$delete from public.review_events$$,
  '42501', null, 'Authenticated clients cannot delete history directly'
);

set local request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select results_eq(
  $$select name from public.decks order by name$$,
  $$values ('B'::text)$$, 'B reads only decks owned by B'
);
select results_eq(
  $$select side_a from public.cards order by side_a$$,
  $$values ('B'::text)$$, 'B reads only cards with a deck owned by B'
);

reset role;
delete from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is(
  (select count(*) from public.cards where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0::bigint, 'Deleting an account cascades to its cards'
);

select * from finish();
rollback;
