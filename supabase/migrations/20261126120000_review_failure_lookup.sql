create index review_failures_account_time_idx
  on public.review_events (user_id, effective_at)
  where disposition = 'applied' and canonical_mode = 'due' and rating = 1;
