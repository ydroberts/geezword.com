// Tests for the stable event QR route /la (vercel.json redirect).
// Run through run-e2e.js (Firestore emulator, demo- project). Nothing reaches
// production Firestore or Mailchimp: such requests are aborted and counted.
"use strict";

const { test, expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");
const { start } = require("./static-server");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SITE_PORT = 5284;
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const PROJECT_ID = "demo-geezword-test";
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const EMULATOR_PORT = EMULATOR_HOST && EMULATOR_HOST.split(":").pop();
const SHOTS = process.env.E2E_SCREENSHOT_DIR || "";

const DESTINATION = "/?utm_source=qr&utm_medium=print&utm_campaign=la-book-signing-2026#explore";
const CAMPAIGN = { utmSource: "qr", utmMedium: "print", utmCampaign: "la-book-signing-2026" };
const PROD_BLOCK = /firestore\.googleapis\.com|list-manage\.com|mailchimp\.com/;

let server;
test.beforeAll(async () => { server = await start(SITE_PORT); });
test.afterAll(async () => { await new Promise((r) => server.close(r)); });

const prodRequests = [];
test.beforeEach(async ({ context }) => {
  await context.route(PROD_BLOCK, (route) => { prodRequests.push(route.request().url()); return route.abort(); });
});

function redirectsConfig() {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "vercel.json"), "utf8")).redirects || [];
}

async function scrollSettled(page) {
  let last = -1, still = 0;
  for (let i = 0; i < 60 && still < 4; i++) {
    const y = await page.evaluate(() => window.scrollY);
    still = y === last ? still + 1 : 0;
    last = y;
    await page.waitForTimeout(120);
  }
}

// ---------------------------------------------------------------------------

test("vercel.json: /la is the only redirect, temporary, with the exact destination", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "vercel.json"), "utf8"));
  expect(cfg.cleanUrls).toBe(true);
  expect(cfg.trailingSlash).toBe(false);
  expect(cfg.rewrites).toBeUndefined();
  expect(redirectsConfig()).toEqual([{ source: "/la", destination: DESTINATION, permanent: false }]);
  const dest = new URL(DESTINATION, "https://www.geezword.com");
  expect(dest.pathname).toBe("/");
  expect(dest.hash).toBe("#explore");
  expect(Object.fromEntries(dest.searchParams)).toEqual({
    utm_source: "qr", utm_medium: "print", utm_campaign: "la-book-signing-2026",
  });
  expect(DESTINATION).not.toMatch(/start/);
  expect(DESTINATION).toBe(DESTINATION.toLowerCase());
});

test("GET /la answers 307 (temporary, not cached) with the exact Location", async ({ request }) => {
  const res = await request.get(`${BASE}/la`, { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toBe(DESTINATION);
  expect(res.headers()["cache-control"]).toMatch(/max-age=0/);
});

test("no redirect loop: the destination is served directly", async ({ request }) => {
  const sources = redirectsConfig().map((r) => r.source);
  expect(sources).not.toContain("/");
  const res = await request.get(`${BASE}${DESTINATION.split("#")[0]}`, { maxRedirects: 0 });
  expect(res.status()).toBe(200);
});

test("other routes are unaffected", async ({ request }) => {
  for (const p of ["/", "/start", "/downloads", "/books", "/play", "/privacy", "/challenge", "/premium", "/admin/community"]) {
    const res = await request.get(`${BASE}${p}`, { maxRedirects: 0 });
    expect(res.status(), p).toBe(200);
  }
  for (const p of ["/lang", "/la-2026", "/las", "/l"]) {
    const res = await request.get(`${BASE}${p}`, { maxRedirects: 0 });
    expect(res.status(), p).toBe(404);
  }
});

for (const [w, h] of [[1440, 900], [390, 844], [320, 568]]) {
  test(`browser at ${w}x${h}: /la lands on the six doors with the campaign in the URL and stored for the tab`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const navigations = [];
    page.on("response", (r) => { if (r.request().isNavigationRequest() && r.url().startsWith(BASE)) navigations.push(r.status()); });
    await page.goto(`${BASE}/la`, { waitUntil: "load" });
    await scrollSettled(page);

    expect(navigations.slice(0, 2)).toEqual([307, 200]);
    expect(page.url()).toBe(`${BASE}${DESTINATION}`);
    expect(new URL(page.url()).pathname).not.toMatch(/start/);
    await expect(page.locator("#explore h2")).toHaveText("What would you like to do?");
    await expect(page.locator("#explore .door-card")).toHaveCount(6);
    const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("geezword-start-campaign")));
    expect(stored).toEqual(CAMPAIGN);
    const pos = await page.evaluate(() => {
      const nav = document.querySelector(".navbar").getBoundingClientRect().bottom;
      const h2 = document.querySelector("#explore h2").getBoundingClientRect();
      return { below: h2.top >= nav, onScreen: h2.bottom <= innerHeight,
               noH: document.documentElement.scrollWidth <= innerWidth };
    });
    expect(pos).toEqual({ below: true, onScreen: true, noH: true });
    // No registration is needed to scan and explore.
    await expect(page.locator("#community-form")).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `la-landing-${w}x${h}.png`) });
  });
}

test("campaign survives browsing and is carried by a later /start registration (emulator)", async ({ page }) => {
  test.skip(!EMULATOR_PORT, "needs the Firestore emulator (npm test)");
  await page.goto(`${BASE}/la`, { waitUntil: "load" });
  // Browse in the same tab: a door, the Play page (which re-reads and re-links
  // the tags), the Downloads page and back to the homepage without tags.
  await page.locator("#door-read a").click();
  await page.waitForURL(/\/books$/);
  await page.goto(`${BASE}/play`);
  const playLinks = await page.locator('a[href*="utm_campaign"]').evaluateAll((as) => as.map((a) => a.href));
  for (const l of playLinks) expect(new URL(l).searchParams.get("utm_campaign")).toBe("la-book-signing-2026");
  await page.goto(`${BASE}/downloads`);
  await page.goto(`${BASE}/`);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("geezword-start-campaign")))).toEqual(CAMPAIGN);

  // Register later in the same tab, against the emulator only.
  const email = `la.qr.${Date.now()}@example.test`;
  await page.goto(`${BASE}/start?firestoreEmulator=${EMULATOR_PORT}#community`);
  const form = page.locator("#community-form");
  await form.locator('input[name="firstName"]').fill("Selam");
  await form.locator('input[name="email"]').fill(email);
  await form.locator("label.lang-radio").filter({ has: page.locator('input[value="en"]') }).click();
  await page.locator("#join-free-button").click();
  await expect(page.locator("#community-success")).toBeVisible({ timeout: 20_000 });

  const url = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/community-signups?pageSize=300`;
  const body = await (await fetch(url, { headers: { Authorization: "Bearer owner" } })).json();
  const doc = (body.documents || []).map((d) => d.fields).find((f) => f.email?.stringValue === email);
  expect(doc, "registration written to the emulator").toBeTruthy();
  expect({
    utmSource: doc.utmSource?.stringValue, utmMedium: doc.utmMedium?.stringValue, utmCampaign: doc.utmCampaign?.stringValue,
  }).toEqual(CAMPAIGN);
  expect(Number(doc.formVersion.integerValue)).toBe(3);
  expect(doc.interests.arrayValue.values.map((v) => v.stringValue)).toEqual(["general"]);
  // No new tracking fields in this phase.
  for (const f of ["entrySource", "firstSource", "lastSource", "campaigns", "utmContent"]) expect(doc[f], f).toBeUndefined();
});

test.afterAll(() => {
  // Across every /la test: nothing reached production Firestore or Mailchimp.
  expect(prodRequests).toEqual([]);
});
