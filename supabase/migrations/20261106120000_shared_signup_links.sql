-- Shared sign-up links: one printed QR code that several people can use at a
-- class. Extends the one-time links from 20261102120000, whose rows and
-- behaviour stay exactly as they are (max_uses = 1).
--
-- used_at keeps its meaning of "no more sign-ups possible": a shared link
-- sets it only when the last place is taken. used_by_member_id stays null on
-- shared links; each sign-up is in the audit log as member.self_registered.

alter table public.signup_links
  add column max_uses smallint not null default 1 check (max_uses between 1 and 100),
  add column use_count smallint not null default 0 check (use_count >= 0);

update public.signup_links set use_count = 1 where used_at is not null;

alter table public.signup_links
  add constraint signup_links_use_count_within_max check (use_count <= max_uses);

-- Same function, same arguments. Only the availability check and the final
-- update change. The row lock means concurrent sign-ups can't pass max_uses.
create or replace function public.redeem_signup_link(
  p_link_id uuid,
  p_user_id uuid,
  p_details jsonb,
  p_consent_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.signup_links%rowtype;
  v_gym public.gyms%rowtype;
  v_email text := lower(btrim(p_details->>'email'));
  v_belt public.belt_color := coalesce(nullif(p_details->>'belt', ''), 'white')::public.belt_color;
  v_stripes smallint := coalesce(nullif(p_details->>'stripes', '')::smallint, 0);
  v_today date;
  v_member_id uuid;
begin
  select * into v_link from public.signup_links where id = p_link_id for update;
  if not found
    or v_link.used_at is not null
    or v_link.use_count >= v_link.max_uses
    or v_link.expires_at <= now() then
    raise exception 'sign-up link unavailable' using errcode = 'P0001', hint = 'LINK_UNAVAILABLE';
  end if;

  select * into v_gym from public.gyms where id = v_link.gym_id;
  if v_gym.kind <> 'gym' or not v_gym.active then
    raise exception 'sign-up link unavailable' using errcode = 'P0001', hint = 'LINK_UNAVAILABLE';
  end if;

  if exists (select 1 from public.members where gym_id = v_gym.id and user_id = p_user_id) then
    raise exception 'already a member' using errcode = 'P0001', hint = 'ALREADY_MEMBER';
  end if;
  if exists (select 1 from public.members where gym_id = v_gym.id and lower(email) = v_email) then
    raise exception 'email already on roster' using errcode = 'P0001', hint = 'EMAIL_IN_GYM';
  end if;

  v_today := (now() at time zone v_gym.timezone)::date;

  insert into public.members (
    gym_id, user_id, role, first_name, last_name, email, phone,
    emergency_contact_name, emergency_contact_phone, belt, stripes, join_date
  ) values (
    v_gym.id,
    p_user_id,
    'athlete',
    btrim(p_details->>'first_name'),
    btrim(p_details->>'last_name'),
    v_email,
    nullif(btrim(p_details->>'phone'), ''),
    nullif(btrim(p_details->>'emergency_contact_name'), ''),
    nullif(btrim(p_details->>'emergency_contact_phone'), ''),
    v_belt,
    v_stripes,
    v_today
  )
  returning id into v_member_id;

  insert into public.belt_history (member_id, gym_id, belt, stripes, promoted_at, is_initial, notes)
  values (v_member_id, v_gym.id, v_belt, v_stripes, now(), true, 'Starting rank (self-reported at sign-up)');

  insert into public.gdpr_consents (member_id, gym_id, data_storage_consent, consented_at, consent_version)
  values (v_member_id, v_gym.id, true, now(), p_consent_version);

  update public.signup_links
    set use_count = use_count + 1,
        used_at = case when use_count + 1 >= max_uses then now() else null end,
        used_by_member_id = case when max_uses = 1 then v_member_id else null end
    where id = v_link.id;

  return v_member_id;
end;
$$;

revoke execute on function public.redeem_signup_link(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.redeem_signup_link(uuid, uuid, jsonb, text) to service_role;
