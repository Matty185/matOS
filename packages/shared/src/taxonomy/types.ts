// Match Analysis Module taxonomy types — extracted at Stage S0 (mobile
// plan §2.1) from where they'd only ever lived inline in the web tagging
// screen (src/components/shared/tagging-screen.tsx). Moved here so the
// mobile app's native tagging player (plan §3.3, Stage M3) can share the
// exact same shapes instead of re-deriving them independently and risking
// drift between the two platforms' tagging UIs.

export type PositionRef = { id: string; name: string; roles: string[] | null };

export type EventTypeRef = {
  id: string;
  category: string;
  name: string;
  modifier_options: string[] | null;
  modifier_required: boolean;
  outcome_required: boolean;
  outcome_options: string[] | null;
};

export type PositionRow = {
  id: string;
  position_id: string;
  role: string | null;
  start_ts: number;
  end_ts: number | null;
};

export type EventRow = {
  id: string;
  event_type_id: string;
  modifier: string | null;
  outcome: string | null;
  ts: number;
};
