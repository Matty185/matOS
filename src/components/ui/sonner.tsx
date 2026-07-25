"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          // min-h-11 (44px, the alpha's touch-target standard): sonner's
          // default action button renders far shorter than that. Stage U4's
          // undo toast (Tagging UX redesign) is this codebase's only
          // consumer of toast's action-button feature, so this specifically
          // fixes that addition's own touch target rather than touching an
          // otherwise-established shared pattern. Found in Stage U6's UX
          // audit.
          actionButton:
            "group-[.toast]:min-h-11 group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
