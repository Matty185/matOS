-- Stage O6 (found in the dress rehearsal): a newly onboarded gym has no
-- payment history in MatOS for the months before it started using it, so
-- Rule 8's "unpaid AND period ended" read every imported member as overdue
-- for every past month in the window (their real join dates go back years)
-- — the whole roster red on day one.
--
-- payments_tracked_from is the first day of the month MatOS started
-- tracking this gym's payments; obligations before it are not computed at
-- all (rendered "—", like months before a member joined). NULL = no lower
-- bound, so every existing gym (Northside demo included) behaves exactly
-- as before. Set by scripts/provision-gym.ts. Owner-editable (it's a gym
-- setting; the gyms_owner_column_guard only protects kind/active/ids).
alter table public.gyms
  add column payments_tracked_from date
    check (payments_tracked_from is null or extract(day from payments_tracked_from) = 1);
