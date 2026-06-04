alter table public.daily_core_accruals
alter column wallet_amount type numeric(30, 12)
using wallet_amount::numeric(30, 12);

alter table public.wallet_accounts
alter column balance type numeric(30, 12)
using balance::numeric(30, 12);

with missing_wallet as (
  select
    user_id,
    sum(gross_amount - core_amount - wallet_amount) as amount
  from public.daily_core_accruals
  where gross_amount > core_amount + wallet_amount
  group by user_id
)
update public.wallet_accounts wallet
set balance = wallet.balance + missing_wallet.amount,
    updated_at = now()
from missing_wallet
where wallet.user_id = missing_wallet.user_id
  and missing_wallet.amount > 0;

update public.daily_core_accruals
set wallet_amount = gross_amount - core_amount
where gross_amount <> core_amount + wallet_amount;

create or replace function public.run_daily_core_accrual(
  p_accrual_date date default ((now() at time zone 'utc')::date)
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  account record;
  daily_rate constant numeric(12, 10) := 0.0006330000;
  gross_amount numeric(30, 12);
  core_amount numeric(30, 12);
  wallet_amount numeric(30, 12);
  inserted boolean;
begin
  for account in
    select user_id, balance, reinvest_percent
    from public.core_accounts
    order by user_id
  loop
    gross_amount := round(account.balance * daily_rate, 12);
    core_amount := round(gross_amount * (account.reinvest_percent / 100), 12);
    wallet_amount := gross_amount - core_amount;
    inserted := false;

    insert into public.daily_core_accruals (
      accrual_date,
      user_id,
      core_before,
      daily_rate,
      gross_amount,
      reinvest_percent,
      core_amount,
      wallet_amount,
      core_after
    )
    values (
      p_accrual_date,
      account.user_id,
      account.balance,
      daily_rate,
      gross_amount,
      account.reinvest_percent,
      core_amount,
      wallet_amount,
      account.balance + core_amount
    )
    on conflict (accrual_date, user_id) do nothing
    returning true into inserted;

    if coalesce(inserted, false) then
      if core_amount > 0 then
        update public.core_accounts
        set balance = balance + core_amount,
            updated_at = now()
        where user_id = account.user_id;
      end if;

      if wallet_amount > 0 then
        update public.wallet_accounts
        set balance = balance + wallet_amount,
            updated_at = now()
        where user_id = account.user_id;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.run_daily_core_accrual(date) from public, anon, authenticated;
