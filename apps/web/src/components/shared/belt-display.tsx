import { cn, ALL_BELTS, BELT_STYLES, BELT_LABELS, type BeltColor } from "@matos/shared";

export { ALL_BELTS, BELT_LABELS };
export type { BeltColor };

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
