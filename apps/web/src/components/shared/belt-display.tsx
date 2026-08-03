import { cn, type Database } from "@matos/shared";

export type BeltColor = Database["public"]["Enums"]["belt_color"];

// Single source of truth for "every belt in order" — used to build filter
// dropdowns and the promote-belt select without a second hand-written copy
// of the enum drifting from this one (flagged in Stage 4 code review).
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
// white are solid.
const BELT_STYLES: Record<BeltColor, { base: string; bar?: string; border?: string }> = {
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

const SIZE_CLASSES = {
  sm: { bar: "h-3 w-10", dot: "h-1 w-1" },
  md: { bar: "h-4 w-14", dot: "h-1.5 w-1.5" },
  lg: { bar: "h-5 w-20", dot: "h-2 w-2" },
};

type BeltDisplayProps = {
  belt: BeltColor;
  stripes: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
};

/**
 * The one place belt colour + stripes ever get rendered, per CLAUDE.md UI
 * Standards. Handles the full enum, including kids belts, uniformly — no
 * separate "kids mode."
 */
export function BeltDisplay({
  belt,
  stripes,
  size = "md",
  showLabel = false,
  className,
}: BeltDisplayProps) {
  const style = BELT_STYLES[belt];
  const sizing = SIZE_CLASSES[size];
  const clampedStripes = Math.max(0, Math.min(4, stripes));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "relative flex items-center justify-end gap-0.5 rounded-sm border",
          sizing.bar,
          style.base,
          style.border ?? "border-black/10",
        )}
        role="img"
        aria-label={`${BELT_LABELS[belt]} belt, ${clampedStripes} stripe${clampedStripes === 1 ? "" : "s"}`}
      >
        {style.bar ? (
          <div className={cn("absolute inset-y-0 left-1/2 w-1/4 -translate-x-1/2", style.bar)} />
        ) : null}
        <div className="relative z-10 mr-1 flex gap-0.5 rounded-sm bg-black/70 px-1 py-0.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "rounded-full",
                sizing.dot,
                i < clampedStripes ? "bg-white" : "bg-white/25",
              )}
            />
          ))}
        </div>
      </div>
      {showLabel ? <span className="text-sm font-medium">{BELT_LABELS[belt]}</span> : null}
    </div>
  );
}
