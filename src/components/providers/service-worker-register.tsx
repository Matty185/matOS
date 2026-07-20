"use client";

import { useEffect } from "react";

// next-pwa's `register: true` injects its registration script into
// webpack's `main.js` entry — the Pages Router bundle. This project uses
// the App Router (main-app.js), which that entry point is never part of,
// so the service worker was being built correctly (public/sw.js exists,
// the manifest links to it) but never actually registered — found via
// Stage 10's production-build PWA check (no registration in
// navigator.serviceWorker.getRegistrations() despite everything else
// checking out). This is the standard manual-registration workaround for
// next-pwa + App Router.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("[pwa] service worker registration failed", error);
    });
  }, []);

  return null;
}
