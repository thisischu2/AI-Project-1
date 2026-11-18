"use client";

import { useEffect } from "react";

/** Registers the offline helper (public/sw.js) once the page has loaded. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Offline support is a bonus; the app still works online without it.
    });
  }, []);
  return null;
}
