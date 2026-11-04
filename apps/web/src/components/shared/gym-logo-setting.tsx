"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ImageUploadButton, useSignedImage } from "@/components/shared/image-upload";

/**
 * Flow audit 10.5 (owner, Settings): the gym logo, shown on the kiosk and
 * the free-trial page. Stored in a private bucket; PNG keeps transparency.
 */
export function GymLogoSetting({ gymId, path }: { gymId: string; path: string | null }) {
  const router = useRouter();
  const url = useSignedImage("gym-logos", path);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch("/api/gym/logo", { method: "DELETE" });
      if (!res.ok) {
        toast.error("Couldn't remove the logo.");
        return;
      }
      toast.success("Logo removed.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">Logo</p>
      <p className="text-sm text-muted-foreground">
        Shown on the front-desk kiosk and your free-trial page.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img
            src={url}
            alt="Your gym logo"
            className="h-14 w-auto max-w-[10rem] rounded object-contain"
          />
        ) : null}
        <ImageUploadButton
          bucket="gym-logos"
          folder={gymId}
          saveUrl="/api/gym/logo"
          label={path ? "Change logo" : "Add logo"}
          max={600}
          keepAlpha
          onSaved={() => router.refresh()}
        />
        {path ? (
          <Button variant="ghost" className="h-11" onClick={remove} disabled={busy}>
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}
