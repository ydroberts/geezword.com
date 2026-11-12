// Minimal static server for the site, mimicking Vercel's cleanUrls
// ("/start" serves start.html). Test-only; never deployed.
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const rel = clean === "/" ? "/index.html" : clean;
  const candidates = [rel, rel + ".html", path.posix.join(rel, "index.html")];
  for (const c of candidates) {
    const full = path.join(ROOT, c);
    if (!full.startsWith(ROOT)) return null; // no path traversal
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

// Redirects from vercel.json (exact-path sources only, which is all the site
// uses): permanent → 308, otherwise 307, with the destination as Location —
// the same responses `vercel dev` returns for these entries.
function loadRedirects() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
    return Array.isArray(cfg.redirects) ? cfg.redirects : [];
  } catch (err) {
    return [];
  }
}

function start(port) {
  const redirects = loadRedirects();
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(req.url.split("?")[0]);
    const redirect = redirects.find((r) => r.source === pathname);
    if (redirect) {
      res.writeHead(redirect.permanent ? 308 : 307, {
        Location: redirect.destination,
        "Cache-Control": "public, max-age=0, must-revalidate",
      });
      res.end();
      return;
    }
    const file = resolveFile(req.url);
    if (!file) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

module.exports = { start, resolveFile, TYPES };
