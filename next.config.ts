import type { NextConfig } from "next";

/**
 * The app is a static site: every page is plain HTML/JS built ahead of time,
 * with no server code, so it can be hosted on GitHub Pages.
 *
 * GitHub Pages serves a project site under /<repo-name>/, so that build sets
 * BASE_PATH (see .github/workflows/pages.yml). Other hosts leave it empty.
 */
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
