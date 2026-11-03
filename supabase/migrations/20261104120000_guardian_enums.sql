-- P1 (flow audit 8.2), part 1 of 2: enum values for parent accounts.
--
-- Kept in their own migration: Postgres can't use a value added with ALTER
-- TYPE ... ADD VALUE in the same transaction, and supabase db push runs each
-- migration file in one transaction. Part 2 (20261104120100) uses them.
--
-- member_role 'guardian': a parent/guardian account. Not staff (every staff
-- check names 'coach'/'gym_owner' explicitly: private.is_coach_or_owner,
-- withAuth's rank, isBillable, needsWaiver), not billed, not on the
-- kiosk. Sees only the children linked to them (part 2).
--
-- checked_in_by 'guardian': a check-in a parent made for their child.

alter type public.member_role add value if not exists 'guardian';
alter type public.checked_in_by add value if not exists 'guardian';
