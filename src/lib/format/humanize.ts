// snake_case -> "Title Case" for taxonomy display (event/category/position
// names, modifiers, outcomes, roles). Deliberately generic rather than a
// hardcoded label map per value — the whole point of Non-Negotiable #3
// ("taxonomy is data, not code") is that a coach-edited or newly-added
// taxonomy row shows up correctly without a code change; a per-value label
// map would silently fall back to the raw snake_case string the moment
// someone added a row this file didn't know about.
export function humanize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatVideoTimestamp(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = Math.floor(clamped % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
