alter table public.feed_post_stat_blocks
drop constraint if exists feed_post_stat_blocks_block_key_check;

alter table public.feed_post_stat_blocks
add constraint feed_post_stat_blocks_block_key_check
check (
  block_key in (
    'core_growth',
    'wallet_income',
    'daily_rate',
    'reinvest',
    'level',
    'total_core_growth',
    'team_strength'
  )
);
