-- Add a "takedown defence" event category to the analysis event taxonomy —
-- an instantaneous event (stuffing/defending an opponent's takedown
-- attempt), same class as takedown/escape/reversal. Kept as its own
-- migration since ALTER TYPE ... ADD VALUE can't safely run in the same
-- transaction as code that uses the new value.

alter type public.analysis_event_type add value 'takedown_defence';
