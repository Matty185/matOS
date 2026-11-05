import Image from "next/image";
import { cn } from "@matos/shared";

const SOURCES = {
  horizontal: {
    color: "/brand/logo-horizontal-color.svg",
    reversed: "/brand/logo-horizontal-reversed.svg",
    width: 212,
    height: 44,
  },
  mark: {
    color: "/brand/mark-color.svg",
    reversed: "/brand/mark-reversed.svg",
    width: 64,
    height: 44,
  },
} as const;

type LogoProps = {
  /** "reversed" is for navy or other dark surfaces. */
  tone?: "color" | "reversed";
  layout?: keyof typeof SOURCES;
  /** Set the height with a class; width follows. */
  className?: string;
};

/**
 * The one place the web app renders the MatOS logo, so replacing the
 * provisional mark means replacing the files in public/brand only.
 * `unoptimized`: these are static vector files, nothing for the optimizer to do.
 */
export function Logo({ tone = "color", layout = "horizontal", className }: LogoProps) {
  const source = SOURCES[layout];
  return (
    <Image
      src={source[tone]}
      alt="MatOS"
      width={source.width}
      height={source.height}
      unoptimized
      className={cn("h-7 w-auto", className)}
    />
  );
}
