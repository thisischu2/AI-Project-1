// Serves the static build in out/ for trying the production app locally (`npm run build && npm start`).
// `next start` doesn't work with a static export. No dependencies; local use only.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "out");
const base = process.env.BASE_PATH ?? "";
const port = Number(process.env.PORT ?? 3000);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8", ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (base && path.startsWith(base)) path = path.slice(base.length) || "/";
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
  } catch {
    res.writeHead(404, { "Content-Type": types[".html"] }).end(await readFile(join(root, "404.html")).catch(() => "Not found"));
  }
}).listen(port, () => console.log(`Serving out/ at http://localhost:${port}${base}/`));
