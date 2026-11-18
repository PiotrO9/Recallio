begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

insert into auth.users (id) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
select ok(
  not has_function_privilege('authenticated', 'recallio_private.lock_sync_account()', 'EXECUTE'),
  'Data API clients cannot execute the sync lock'
);
select ok(
  not has_function_privilege('anon', 'recallio_private.next_sync_cursor()', 'EXECUTE'),
  'Anonymous clients cannot allocate a cursor'
);
select ok(
  not has_table_privilege('recallio_backend', 'auth.users', 'SELECT'),
  'The backend role has no direct access to authentication records'
);

grant recallio_backend to postgres with set true;
grant usage on schema extensions to recallio_backend;
set local role recallio_backend;
select throws_ok(
  $$select recallio_private.lock_sync_account()$$,
  '42501', 'Missing account context', 'The backend must bind an account'
);
set local recallio.user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
select is(recallio_private.lock_sync_account(), 0::bigint, 'An account starts at cursor zero');
select throws_ok(
  $statement$do $$begin
    if recallio_private.next_sync_cursor() is distinct from 1::bigint then
      raise exception 'Unexpected initial cursor';
    end if;
    raise exception 'Roll back cursor';
  end$$$statement$,
  'P0001', 'Roll back cursor', 'A transaction can abort after allocating cursor one'
);
select is(recallio_private.next_sync_cursor(), 1::bigint, 'Rollback restores the cursor');
set local recallio.user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select is(recallio_private.lock_sync_account(), 0::bigint, 'Another account keeps its own cursor');
select is(
  (select count(*) from recallio_private.sync_heads where last_sequence = 1),
  0::bigint, 'The backend cannot read another account cursor'
);

select * from finish();
rollback;
