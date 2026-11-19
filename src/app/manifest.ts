import type { MetadataRoute } from "next";

// Built once into a static file (the site has no server).
export const dynamic = "force-static";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Makes the app installable: "Add to Home Screen" opens it in its own window. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "6IX DEGREES",
    short_name: "6IX",
    description: "Remember the people you meet and see how your network connects.",
    id: `${BASE}/`,
    start_url: `${BASE}/`,
    scope: `${BASE}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090B",
    theme_color: "#09090B",
    categories: ["productivity", "social"],
    icons: [
      { src: `${BASE}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${BASE}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
