"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

// Flow audit 2.6 / 10.5: member photos and the gym logo live in private
// storage buckets; pages show them through signed URLs (one hour).

type Bucket = "member-photos" | "gym-logos";

const SIGNED_URL_SECONDS = 3600;

/** A signed URL for one stored image, or null (none / not allowed / loading). */
export function useSignedImage(bucket: Bucket, path: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ["signed-image", bucket, path],
    enabled: !!path,
    staleTime: (SIGNED_URL_SECONDS - 300) * 1000,
    queryFn: async () => {
      const { data } = await createClient()
        .storage.from(bucket)
        .createSignedUrl(path!, SIGNED_URL_SECONDS);
      return data?.signedUrl ?? null;
    },
  });
  return path ? (data ?? null) : null;
}

/** Signed URLs for many member photos at once (members list). */
export function useSignedPhotos(paths: string[]) {
  const key = Array.from(new Set(paths)).sort();
  const { data } = useQuery({
    queryKey: ["signed-photos", key],
    enabled: key.length > 0,
    staleTime: (SIGNED_URL_SECONDS - 300) * 1000,
    queryFn: async () => {
      const { data } = await createClient()
        .storage.from("member-photos")
        .createSignedUrls(key, SIGNED_URL_SECONDS);
      return new Map(
        (data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path!, d.signedUrl]),
      );
    },
  });
  return data ?? new Map<string, string>();
}

/**
 * Re-encodes an image in the browser: at most `max` px on the long side,
 * JPEG (or PNG to keep a logo's transparency). Drawing to a canvas drops
 * all metadata, including any GPS location in a phone photo's EXIF.
 */
async function reencode(file: File, max: number, keepAlpha: boolean): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const type = keepAlpha ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  if (!blob) throw new Error("encode failed");
  return blob;
}

/**
 * A button that picks an image, re-encodes it, uploads it to `folder` in
 * the bucket (storage RLS decides who may), then calls `saveUrl` (PUT
 * { path }). The upload is removed again if saving fails.
 */
export function ImageUploadButton({
  bucket,
  folder,
  saveUrl,
  label,
  onSaved,
  max = 512,
  keepAlpha = false,
}: {
  bucket: Bucket;
  folder: string;
  saveUrl: string;
  label: string;
  onSaved: () => void;
  max?: number;
  keepAlpha?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const ext = keepAlpha ? "png" : "jpg";
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    try {
      const blob = await reencode(file, max, keepAlpha);
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, blob, { contentType: blob.type, upsert: false });
      if (uploadError) {
        toast.error("Couldn't upload the image.");
        return;
      }
      const res = await fetch(saveUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        await supabase.storage.from(bucket).remove([path]);
        toast.error(body.error ?? "Couldn't save the image.");
        return;
      }
      toast.success("Saved.");
      onSaved();
    } catch {
      toast.error("Couldn't read that image. Try a JPEG or PNG.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Uploading..." : label}
      </Button>
    </>
  );
}

/** Round avatar: the photo, or initials. */
export function MemberAvatar({
  url,
  firstName,
  lastName,
  size = 40,
}: {
  url: string | null | undefined;
  firstName: string;
  lastName: string;
  size?: number;
}) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimisable
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
      style={{ width: size, height: size }}
    >
      {initials}
    </span>
  );
}
