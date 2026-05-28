revoke all on function public.complete_user_challenge(uuid, uuid, text, numeric) from public;
revoke all on function public.complete_user_challenge(uuid, uuid, text, numeric) from anon;
revoke all on function public.complete_user_challenge(uuid, uuid, text, numeric) from authenticated;

grant execute on function public.complete_user_challenge(uuid, uuid, text, numeric) to service_role;
