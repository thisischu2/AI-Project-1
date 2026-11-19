"use client";

import { useEffect } from "react";

/** Registers the offline helper (public/sw.js) once the page has loaded. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    // On GitHub Pages the site lives under /<repo>/, so the worker does too.
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    navigator.serviceWorker.register(`${base}/sw.js`, { scope: `${base}/`, updateViaCache: "none" }).catch(() => {
      // Offline support is a bonus; the app still works online without it.
    });
  }, []);
  return null;
}
