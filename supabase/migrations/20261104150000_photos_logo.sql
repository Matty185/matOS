-- P2 (flow audit 2.6 + 10.5): member photos and the gym logo.
--
-- Two PRIVATE storage buckets (CLAUDE.md: no public SELECT on anything):
-- * member-photos: <gym_id>/<member_id>/<random>.jpg
--     read:  staff of that gym; the member themselves; their parents (8.2)
--     write: staff of that gym
-- * gym-logos:     <gym_id>/<random>.<ext>
--     read:  anyone in that gym
--     write: the gym's owner
-- Pages show them through short-lived signed URLs. The two public pages
-- (free-trial link, kiosk) get a signed logo URL from the server.
--
-- members.photo_url and gyms.logo_url (both unused until now) hold the
-- object PATH, set only through the API routes, which check the path is in
-- the right gym/member folder. Images are re-encoded in the browser before
-- upload (strips EXIF, e.g. GPS) and limited to 2 MB of JPEG/PNG/WebP.
-- Athletes can't set their own photo_url (self-update guard, migration
-- 20261104130000).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('member-photos', 'member-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('gym-logos', 'gym-logos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── member-photos ───────────────────────────────────────────────────────────
create policy member_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'member-photos'
    and (
      (
        (storage.foldername(name))[1] = (select private.my_gym_id())::text
        and (select private.is_coach_or_owner())
      )
      or (
        (storage.foldername(name))[1] = (select private.my_gym_id())::text
        and (
          (storage.foldername(name))[2] = (select private.my_member_id())::text
          or (storage.foldername(name))[2] in (select c::text from private.my_child_ids() c)
        )
      )
    )
  );

create policy member_photos_insert_staff on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select private.my_gym_id())::text
    and (select private.is_coach_or_owner())
    -- A real gym (personal workspaces have no photos) and a real member of it.
    and exists (select 1 from public.gyms g where g.id = (select private.my_gym_id()) and g.kind = 'gym')
    and exists (
      select 1 from public.members m
      where m.id::text = (storage.foldername(name))[2] and m.gym_id = (select private.my_gym_id())
    )
  );

create policy member_photos_update_staff on storage.objects
  for update to authenticated
  using (
    bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select private.my_gym_id())::text
    and (select private.is_coach_or_owner())
    -- A real gym (personal workspaces have no photos) and a real member of it.
    and exists (select 1 from public.gyms g where g.id = (select private.my_gym_id()) and g.kind = 'gym')
    and exists (
      select 1 from public.members m
      where m.id::text = (storage.foldername(name))[2] and m.gym_id = (select private.my_gym_id())
    )
  )
  with check (
    bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select private.my_gym_id())::text
    and (select private.is_coach_or_owner())
    -- A real gym (personal workspaces have no photos) and a real member of it.
    and exists (select 1 from public.gyms g where g.id = (select private.my_gym_id()) and g.kind = 'gym')
    and exists (
      select 1 from public.members m
      where m.id::text = (storage.foldername(name))[2] and m.gym_id = (select private.my_gym_id())
    )
  );

create policy member_photos_delete_staff on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'member-photos'
    and (storage.foldername(name))[1] = (select private.my_gym_id())::text
    and (select private.is_coach_or_owner())
  );

-- ── gym-logos ───────────────────────────────────────────────────────────────
create policy gym_logos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'gym-logos'
    and (storage.foldername(name))[1] = (select private.my_gym_id())::text
  );

create policy gym_logos_insert_owner on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'gym-logos'
    and (storage.foldername(name))[1] = (select private.my_gym_id())::text
    and (select private.is_owner())
    and exists (select 1 from public.gyms g where g.id = (select private.my_gym_id()) and g.kind = 'gym')
  );

create policy gym_logos_update_owner on storage.objects
  for update to authenticated
  using (
    bucket_id = 'gym-logos'
    and (storage.foldername(name))[1] = (select private.my_gym_id())::text
    and (select private.is_owner())
    and exists (select 1 from public.gyms g where g.id = (select private.my_gym_id()) and g.kind = 'gym')
  )
  with check (
    bucket_id = 'gym-logos'
    and (storage.foldername(name))[1] = (select private.my_gym_id())::text
    and (select private.is_owner())
    and exists (select 1 from public.gyms g where g.id = (select private.my_gym_id()) and g.kind = 'gym')
  );

create policy gym_logos_delete_owner on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'gym-logos'
    and (storage.foldername(name))[1] = (select private.my_gym_id())::text
    and (select private.is_owner())
  );
