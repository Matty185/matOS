-- Stage 5: the Attendance page needs check-ins to "appear live" per plan §7
-- ("Attendance view uses Supabase realtime"). Supabase Realtime only
-- streams postgres_changes for tables explicitly added to the
-- supabase_realtime publication — attendance wasn't added when the table
-- was created in Stage 1, since nothing consumed realtime yet.
--
-- RLS still applies to what a subscribed client actually receives (Realtime
-- evaluates the subscriber's RLS-scoped SELECT access per row), so this
-- doesn't widen what any client can see — it only turns on the live-update
-- transport for rows a client could already read via a normal query.

alter publication supabase_realtime add table public.attendance;
