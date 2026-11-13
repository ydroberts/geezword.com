// Event-readiness checks for the LA reorganization (Learn & Play and
// Type & Translate pages, no broken links, protected URLs unchanged).
// Run through run-e2e.js. Nothing is submitted anywhere.
"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { start } = require("./static-server");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SITE_PORT = 5286;
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const SHOTS = process.env.E2E_SCREENSHOT_DIR || "";

// Published products verified in the 2026-11-13 audit (custom geezword.com domains).
const VERIFIED_APPS = new Set([
  "universe.geezword.com", "quest.geezword.com", "lissan.geezword.com",
  "tigrinya-for-beginners.geezword.com", "tracing.geezword.com",
  "games.geezword.com", "racing.geezword.com", "kidase.geezword.com",
]);
const PAGES = ["index", "about", "apps", "books", "challenge", "downloads", "learn", "play", "premium", "privacy", "start", "type"];

let server;
test.beforeAll(async () => { server = await start(SITE_PORT); });
test.afterAll(async () => { await new Promise((r) => server.close(r)); });

const read = (file) => fs.readFileSync(path.join(REPO_ROOT, file), "utf8").replace(/\r/g, "");
async function quiet(page) {
  await page.route(/googlesyndication|doubleclick|googletagmanager|google-analytics|firestore\.googleapis\.com|list-manage\.com/, (r) => r.abort());
}
const mainLinks = (page) => page.locator("main a, body > section a").evaluateAll((as) => as.map((a) => a.href));

test("Learn & Play links only to verified published apps and existing pages", async ({ page }) => {
  await quiet(page);
  await page.goto(`${BASE}/learn`);
  const hrefs = await mainLinks(page);
  const external = hrefs.filter((h) => !h.startsWith(BASE) && !h.startsWith("mailto:"));
  for (const h of external) expect(VERIFIED_APPS.has(new URL(h).host), h).toBe(true);
  for (const host of ["universe", "quest", "lissan", "tigrinya-for-beginners", "tracing", "games", "racing"]) {
    expect(external.some((h) => new URL(h).host === `${host}.geezword.com`), host).toBe(true);
  }
  const internal = hrefs.filter((h) => h.startsWith(BASE)).map((h) => new URL(h).pathname);
  for (const p of ["/challenge", "/play", "/books.html", "/apps.html", "/start"]) expect(internal, p).toContain(p);
  // Kidase has its own menu item: no Kidase app card in the Learn & Play grid.
  await expect(page.locator('.app-card[href="https://kidase.geezword.com"]')).toHaveCount(0);
  await expect(page.locator("#teach")).toHaveCount(1);
  expect(read("learn.html")).not.toMatch(/vercel\.app|adsbygoogle|googlesyndication/);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "learn-1440.png"), fullPage: true });
});

test("Type & Translate shows the paid keyboard and fonts; future features are labelled and unlinked", async ({ page }) => {
  await quiet(page);
  await page.goto(`${BASE}/type`);
  const kb = page.locator("#geezword-desktop");
  await expect(kb.locator(".tag-paid")).toHaveText("Paid");
  await expect(kb.locator('a[href^="mailto:info@geezword.com"]')).toHaveCount(1);
  await expect(page.locator('a[href="downloads.html#fonts"]')).toHaveCount(1);
  await expect(page.locator('body > section a[href="downloads.html"]')).toHaveCount(1);
  const later = page.locator("#coming-later").locator("xpath=ancestor::section").locator(".app-card");
  await expect(later).toHaveCount(3);
  expect(await later.locator("h3").allInnerTexts()).toEqual(["Type online", "Translation", "GeezType to Unicode"]);
  for (let i = 0; i < 3; i++) {
    await expect(later.nth(i).locator(".tag-preview")).toHaveText("Coming later");
    await expect(later.nth(i).locator("a")).toHaveCount(0);
  }
  const external = (await mainLinks(page)).filter((h) => !h.startsWith(BASE) && !h.startsWith("mailto:"));
  expect(external).toEqual([]); // no app, converter or translation links yet
  expect(read("type.html")).not.toMatch(/vercel\.app|adsbygoogle|googlesyndication|keymanweb/i);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "type-1440.png"), fullPage: true });
});

test("no broken internal links or anchors on any page", async ({ page, request }) => {
  await quiet(page);
  const checked = new Map();
  const problems = [];
  for (const name of PAGES) {
    await page.goto(`${BASE}/${name === "index" ? "" : name}`);
    const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.href));
    for (const h of hrefs) {
      if (!h.startsWith(BASE)) continue;
      const u = new URL(h);
      const key = u.pathname + u.search;
      if (!checked.has(key)) {
        const res = await request.get(BASE + key);
        checked.set(key, { status: res.status(), html: res.status() === 200 ? await res.text() : "" });
      }
      const { status, html } = checked.get(key);
      if (status !== 200) problems.push(`${name}: ${key} → ${status}`);
      else if (u.hash.length > 1 && !html.includes(`id="${decodeURIComponent(u.hash.slice(1))}"`)) problems.push(`${name}: ${key}${u.hash} → missing anchor`);
    }
  }
  expect(problems).toEqual([]);
  expect(checked.size).toBeGreaterThan(15);
});

test("event URLs still work: /start#community, /#explore, /play?game=…, /downloads, /premium, /challenge", async ({ page, request }) => {
  for (const p of ["/downloads", "/premium", "/challenge", "/play", "/play?game=sort", "/start", "/apps", "/books"]) {
    expect((await request.get(`${BASE}${p}`)).status(), p).toBe(200);
  }
  await quiet(page);
  await page.goto(`${BASE}/start#community`);
  await expect(page.locator("#community-form")).toHaveCount(1);
  await page.goto(`${BASE}/#explore`);
  await expect(page.locator("#explore .door-card")).toHaveCount(6);
  await page.goto(`${BASE}/play?game=sort`);
  await expect(page.locator("h1")).toHaveCount(1);
  // The printed QR redirect is unchanged.
  const master = execFileSync("git", ["show", "origin/master:vercel.json"], { cwd: REPO_ROOT, encoding: "utf8" });
  expect(JSON.parse(read("vercel.json"))).toEqual(JSON.parse(master));
});

test("registration and backend files are untouched", async () => {
  const changed = execFileSync("git", ["diff", "--name-only", "origin/master", "--"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean);
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean);
  const all = [...changed, ...untracked];
  for (const f of all) {
    expect(f, "must not change").not.toMatch(/^(functions\/|firestore\.|firebase\.json|\.firebaserc|start\.css|journey\.js|vercel\.json|\.vercelignore)/);
  }
});

test("Learn & Play Lissan card: approved wording, links only to the Lissan front page", async ({ page }) => {
  await quiet(page);
  await page.goto(`${BASE}/learn`);
  const card = page.locator("#lissan-card");
  await expect(card).toHaveAttribute("href", "https://lissan.geezword.com/");
  await expect(card.locator("p").first()).toHaveText(
    "Beginner courses in Amharic (12 lessons) and Tigrinya (8 lessons), with alphabet learning, everyday phrases, and AI conversation practice. Guest access available.");
  await expect(card).toContainText("First Steps · Greetings & Introductions · Numbers & Counting");
  // No deep links into individual Lissan lessons anywhere on the page.
  const lissan = (await page.locator("a").evaluateAll((as) => as.map((a) => a.href))).filter((h) => h.includes("lissan.geezword.com"));
  for (const h of lissan) expect(new URL(h).pathname, h).toBe("/");
});
