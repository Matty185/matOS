-- Stage O6 re-verification (security-reviewer, residual of the O4/O5 F1
-- fix): 20261030130000 made members.user_id immutable on UPDATE for
-- end-user roles, but members_insert_staff never constrained new.user_id
-- on INSERT. A coach could insert a fresh member row already bound to
-- someone else's auth user (e.g. a member of another gym); the
-- members_sync_memberships trigger would then mark that membership
-- is_current and silently switch the victim's active gym — a
-- context-hijack/denial of service, no role gained.
--
-- Every legitimate end-user insert (POST /api/members, import, /api/team)
-- creates an unclaimed row; accounts are only ever linked by service-role
-- paths (invite claim, signup). So end-user roles may never insert a row
-- with user_id set.
create or replace function public.members_user_id_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
    (tg_op = 'INSERT' and new.user_id is not null)
    or (tg_op = 'UPDATE' and new.user_id is distinct from old.user_id)
  ) then
    raise exception 'members.user_id can only be changed by the system'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger members_user_id_immutable on public.members;
create trigger members_user_id_immutable
  before insert or update of user_id on public.members
  for each row execute function public.members_user_id_immutable();
