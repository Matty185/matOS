// Shared by profile-view.tsx and compare-view.tsx — extracted rather than
// duplicated per Stage A6, since the comparison screen renders the exact
// same metric values a single profile does, just paired.

export function formatPct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

// Rate metrics (e.g. "takedown attempts / match") are averages, not
// fractions of a whole — formatting them with formatPct would turn a
// perfectly normal "1.0 attempts/match" into a nonsensical "100%". Kept as
// a distinct format rather than inferring from the label text.
export function formatRate(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}
