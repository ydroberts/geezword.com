// Homepage community section (approved 2026-11-17): "Join the Geezword
// Community" as its own section after the banner, linking to the unchanged
// /start form. Registration code and backend must be untouched.
"use strict";

const { test, expect } = require("@playwright/test");
const path = require("path");
const { execFileSync } = require("child_process");
const { start } = require("./static-server");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SITE_PORT = 5289;
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const SHOTS = process.env.E2E_SCREENSHOT_DIR || "";
const BLOCK = /googlesyndication|doubleclick|firestore\.googleapis\.com|list-manage|mailchimp/;

let server;
test.beforeAll(async () => { server = await start(SITE_PORT); });
test.afterAll(async () => { await new Promise((r) => server.close(r)); });
test.beforeEach(async ({ context }) => { await context.route(BLOCK, (r) => r.abort()); });

function contrast(fg, bg) {
  const lum = (c) => {
    const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

test("registration form, campaign script and backend are byte-identical to master", () => {
  const files = ["start.html", "start.css", "journey.js", "firestore.rules", "firebase.json", "functions/index.js", "functions/package.json"];
  const diff = execFileSync("git", ["diff", "--stat", "origin/master", "--", ...files], { cwd: REPO_ROOT, encoding: "utf8" });
  expect(diff).toBe("");
});

test("community section: readable contrast, heading order, one main Join button", async ({ page }) => {
  await page.goto(`${BASE}/`);
  const pairs = await page.evaluate(() => {
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return "rgb(255, 255, 255)"; };
    return ["#community h2", "#community-intro", "#community-join", "#community .community-note", "#community .community-benefits-title",
      "#community .community-benefits li", "#community .community-optin", "#community-join-bottom"]
      .map((s) => { const e = document.querySelector(s); return [s, getComputedStyle(e).color, bgOf(e)]; });
  });
  for (const [s, fg, bg] of pairs) expect(contrast(fg, bg), `${s} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  const levels = await page.locator("#community h2, #community h3").evaluateAll((hs) => hs.map((h) => h.tagName));
  expect(levels).toEqual(["H2", "H3"]);
  await expect(page.locator('#community a[href="/start#community"]')).toHaveCount(1);
  // Keyboard focus is visible on the indigo background.
  await page.locator("#home .hero-community a").focus();
  await page.keyboard.press("Tab");
  await expect(page.locator("#community-join")).toBeFocused();
  const ring = await page.locator("#community-join").evaluate((b) => getComputedStyle(b).outlineStyle);
  expect(ring).toBe("solid");
});

for (const [w, h] of [[320, 568], [390, 844], [430, 932], [768, 1024], [1440, 900]]) {
  test(`${w}px: section fits, no sideways scrolling, also at 200% text`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w < 700, hasTouch: w < 700 });
    await ctx.route(BLOCK, (r) => r.abort());
    const page = await ctx.newPage();
    await page.goto(`${BASE}/la`, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const fits = () => page.evaluate(() => {
      const s = document.querySelector("#community").getBoundingClientRect();
      return document.documentElement.scrollWidth <= innerWidth && s.left >= 0 && s.right <= innerWidth + 0.5;
    });
    expect(await fits()).toBe(true);
    if (SHOTS) {
      await page.screenshot({ path: path.join(SHOTS, `community-arrival-${w}.png`) });
      await page.locator("#community").screenshot({ path: path.join(SHOTS, `community-section-${w}.png`) });
    }
    if (w <= 430) {
      await page.addStyleTag({ content: "html{font-size:200% !important}" });
      expect(await fits()).toBe(true);
    }
    await ctx.close();
  });
}
