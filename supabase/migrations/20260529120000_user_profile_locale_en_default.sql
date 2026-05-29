alter table public.user_profiles
  alter column default_locale set default 'en';

update public.user_profiles
set default_locale = 'en'
where default_locale is null
   or default_locale not in ('ru', 'en');

alter table public.user_profiles
  drop constraint if exists user_profiles_default_locale_check;

alter table public.user_profiles
  add constraint user_profiles_default_locale_check
  check (default_locale in ('ru', 'en'));
