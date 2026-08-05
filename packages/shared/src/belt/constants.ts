import type { Database } from "../types/database";

export type BeltColor = Database["public"]["Enums"]["belt_color"];

// Single source of truth for "every belt in order" — used to build filter
// dropdowns and the promote-belt select without a second hand-written copy
// of the enum drifting from this one (flagged in Stage 4 code review).
// Extracted from apps/web's belt-display.tsx (Stage M1) so apps/mobile's
// own <BeltDisplay /> renders the identical taxonomy and styling — belt
// rendering is a shared cross-platform concern, not just a web one.
export const ALL_BELTS: BeltColor[] = [
  "white",
  "grey_white",
  "grey",
  "grey_black",
  "yellow_white",
  "yellow",
  "yellow_black",
  "orange_white",
  "orange",
  "orange_black",
  "green_white",
  "green",
  "green_black",
  "blue",
  "purple",
  "brown",
  "black",
];

// Kids belts (grey/yellow/orange/green families) use a base colour with a
// contrasting bar for the "_white"/"_black" stripe variants — the standard
// BJJ kids-belt convention. Adult belts (blue/purple/brown/black) and plain
// white are solid. Values are Tailwind class strings — NativeWind resolves
// the same className syntax web's Tailwind does, so these are reused as-is
// on mobile rather than translated to RN style objects.
export const BELT_STYLES: Record<BeltColor, { base: string; bar?: string; border?: string }> = {
  white: { base: "bg-white", border: "border-neutral-300" },
  grey_white: { base: "bg-neutral-400", bar: "bg-white" },
  grey: { base: "bg-neutral-400" },
  grey_black: { base: "bg-neutral-400", bar: "bg-neutral-900" },
  yellow_white: { base: "bg-yellow-400", bar: "bg-white" },
  yellow: { base: "bg-yellow-400" },
  yellow_black: { base: "bg-yellow-400", bar: "bg-neutral-900" },
  orange_white: { base: "bg-orange-500", bar: "bg-white" },
  orange: { base: "bg-orange-500" },
  orange_black: { base: "bg-orange-500", bar: "bg-neutral-900" },
  green_white: { base: "bg-green-600", bar: "bg-white" },
  green: { base: "bg-green-600" },
  green_black: { base: "bg-green-600", bar: "bg-neutral-900" },
  blue: { base: "bg-blue-600" },
  purple: { base: "bg-purple-600" },
  brown: { base: "bg-amber-800" },
  black: { base: "bg-neutral-900" },
};

export const BELT_LABELS: Record<BeltColor, string> = {
  white: "White",
  grey_white: "Grey/White",
  grey: "Grey",
  grey_black: "Grey/Black",
  yellow_white: "Yellow/White",
  yellow: "Yellow",
  yellow_black: "Yellow/Black",
  orange_white: "Orange/White",
  orange: "Orange",
  orange_black: "Orange/Black",
  green_white: "Green/White",
  green: "Green",
  green_black: "Green/Black",
  blue: "Blue",
  purple: "Purple",
  brown: "Brown",
  black: "Black",
};
