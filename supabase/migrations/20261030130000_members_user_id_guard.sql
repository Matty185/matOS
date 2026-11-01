-- Stage O4/O5 gate fix (security-reviewer F1, pre-existing gap made material
-- by real staff rows): members_update_staff lets any coach UPDATE any
-- member row in their gym, and no trigger guarded `user_id`. Via direct
-- REST a coach could null the owner's user_id and point it at their own
-- auth user — every private.my_* helper resolves role through
-- members.user_id, so they'd become the owner and lock the real one out,
-- without touching `role` or `active` (so neither existing guard fires).
--
-- `user_id` is identity, not a profile field: it is only ever set by the
-- invite-claim route, signup, and GDPR anonymisation — all service-role.
-- End-user roles may never change it, on any row, in any gym.
create or replace function public.members_user_id_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.user_id is distinct from old.user_id then
    raise exception 'members.user_id can only be changed by the system'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger members_user_id_immutable
  before update of user_id on public.members
  for each row execute function public.members_user_id_immutable();
