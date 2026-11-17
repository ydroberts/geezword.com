// Phone layout of "What would you like to do?" for QR visitors (approved
// 2026-11-17): two columns × three rows, whole card tappable, full
// descriptions, Join button above the doors, homepage search behind a 🔍
// button. Tablets (768px) and desktop are unchanged.
// Run through run-e2e.js (Firestore emulator, demo- project). Nothing reaches
// production Firestore or Mailchimp: such requests are aborted and counted.
"use strict";

const { test, expect } = require("@playwright/test");
const path = require("path");
const { execFileSync } = require("child_process");
const { start } = require("./static-server");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SITE_PORT = 5287;
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const PROJECT_ID = "demo-geezword-test";
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const EMULATOR_PORT = EMULATOR_HOST && EMULATOR_HOST.split(":").pop();
const SHOTS = process.env.E2E_SCREENSHOT_DIR || "";

const CAMPAIGN = { utmSource: "qr", utmMedium: "print", utmCampaign: "la-book-signing-2026" };
const PROD_BLOCK = /firestore\.googleapis\.com|list-manage\.com|mailchimp\.com|googlesyndication|doubleclick|googletagmanager|google-analytics/;
const DOOR_ORDER = ["door-learn", "door-play", "door-read", "door-type", "door-kidase", "door-teach"];
const PHONES = [[320, 568], [375, 812], [390, 844], [430, 932]];

let server;
test.beforeAll(async () => { server = await start(SITE_PORT); });
test.afterAll(async () => { await new Promise((r) => server.close(r)); });

const prodRequests = [];
test.beforeEach(async ({ context }) => {
  await context.route(PROD_BLOCK, (route) => {
    if (/firestore|list-manage|mailchimp/.test(route.request().url())) prodRequests.push(route.request().url());
    return route.abort();
  });
});
test.afterAll(() => { expect(prodRequests).toEqual([]); });

async function scrollSettled(page) {
  let last = -1, still = 0;
  for (let i = 0; i < 60 && still < 4; i++) {
    const y = await page.evaluate(() => window.scrollY);
    still = y === last ? still + 1 : 0;
    last = y;
    await page.waitForTimeout(120);
  }
}

async function openLa(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE}/la`, { waitUntil: "load" });
  await scrollSettled(page);
}

// Door descriptions and links exactly as on master: nothing shortened or changed.
function masterDoors() {
  const html = execFileSync("git", ["show", "origin/master:index.html"], { cwd: REPO_ROOT, encoding: "utf8" });
  const out = {};
  for (const m of html.matchAll(/<li class="door-card" id="([^"]+)">[\s\S]*?<h3>([^<]+)<\/h3>\s*<p>([^<]+)<\/p>\s*<a href="([^"]+)"/g)) {
    out[m[1]] = { title: m[2], desc: m[3].replace(/&amp;/g, "&"), href: m[4] };
  }
  return out;
}

for (const [w, h] of PHONES) {
  test(`${w}x${h}: six readable doors in a 2 × 3 grid, nothing overlapping, no sideways scrolling`, async ({ page }) => {
    await openLa(page, w, h);
    const r = await page.evaluate(() => {
      const box = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
      return {
        scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
        cards: [...document.querySelectorAll("#explore .door-card")].map((c) => ({
          id: c.id, card: box(c),
          parts: [".door-glyph", "h3", "p", ".door-link"].map((s) => box(c.querySelector(s))),
          title: c.querySelector("h3").textContent.trim(),
          desc: c.querySelector("p").textContent.trim(),
          href: c.querySelector(".door-link").getAttribute("href"),
          descPx: parseFloat(getComputedStyle(c.querySelector("p")).fontSize),
          titlePx: parseFloat(getComputedStyle(c.querySelector("h3")).fontSize),
        })),
      };
    });
    expect(r.scrollW).toBeLessThanOrEqual(r.innerW);
    expect(r.cards.map((c) => c.id)).toEqual(DOOR_ORDER);
    // Rows: Learn|Play, Read|Type, Kidase|Teach.
    for (let row = 0; row < 3; row++) {
      const [a, b] = [r.cards[row * 2], r.cards[row * 2 + 1]];
      expect(Math.abs(a.card.t - b.card.t), `row ${row + 1} aligned`).toBeLessThan(1);
      expect(a.card.r, `${a.id} left of ${b.id}`).toBeLessThanOrEqual(b.card.l);
      if (row) expect(a.card.t).toBeGreaterThan(r.cards[(row - 1) * 2].card.b);
    }
    const master = masterDoors();
    for (const c of r.cards) {
      expect({ title: c.title, desc: c.desc, href: c.href }, c.id).toEqual(master[c.id]);
      expect(c.card.w, `${c.id} width`).toBeGreaterThanOrEqual(130);
      expect(c.card.h, `${c.id} height`).toBeGreaterThanOrEqual(44);
      expect(c.card.l).toBeGreaterThanOrEqual(0);
      expect(c.card.r).toBeLessThanOrEqual(w);
      expect(c.descPx, `${c.id} description size`).toBeGreaterThanOrEqual(14);
      expect(c.titlePx).toBeGreaterThanOrEqual(18);
      // Every part sits inside its card; letter|title, description, link don't overlap.
      for (const p of c.parts) {
        expect(p.l).toBeGreaterThanOrEqual(c.card.l - 0.5);
        expect(p.r).toBeLessThanOrEqual(c.card.r + 0.5);
        expect(p.b).toBeLessThanOrEqual(c.card.b + 0.5);
      }
      const [glyph, title, desc, link] = c.parts;
      expect(glyph.r, `${c.id} letter beside title`).toBeLessThanOrEqual(title.l + 0.5);
      expect(Math.max(glyph.b, title.b)).toBeLessThanOrEqual(desc.t + 0.5);
      expect(desc.b).toBeLessThanOrEqual(link.t + 0.5);
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `mobile-la-${w}.png`) });
  });

  test(`${w}x${h}: Join the Free Geezword Community is above the six doors, visible without scrolling`, async ({ page }) => {
    await openLa(page, w, h);
    const r = await page.evaluate(() => {
      const first = Math.min(...[...document.querySelectorAll("#explore .door-card")].map((c) => c.getBoundingClientRect().top));
      const j = document.querySelector("#explore-join").getBoundingClientRect();
      const nav = document.querySelector(".navbar").getBoundingClientRect().bottom;
      return { firstDoorTop: first, top: j.top, bottom: j.bottom, w: j.width, h: j.height, nav, vh: innerHeight, vw: innerWidth };
    });
    expect(r.bottom).toBeLessThan(r.firstDoorTop);
    expect(r.top).toBeGreaterThanOrEqual(r.nav);
    expect(r.h).toBeGreaterThanOrEqual(48);                    // full-width, easy to tap
    expect(r.w).toBeGreaterThanOrEqual(r.vw - 40);
    // Visible on arrival even after iPhone Safari's toolbars (~190px) take their share.
    expect(r.bottom, "visible without scrolling").toBeLessThanOrEqual(r.vh - 190);
    // The other registration links are still there.
    await expect(page.locator('#home .hero-community a[href="/start#community"]')).toHaveCount(1);
    await expect(page.locator('.nav-links a.nav-join[href="#community"]')).toHaveCount(1);
  });
}

test("every door: tapping anywhere on the card opens its destination (390px)", async ({ page, context }) => {
  await context.route(/kidase\.geezword\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>Kidase</title>" }));
  for (const id of DOOR_ORDER) {
    await openLa(page, 390, 844);
    const card = page.locator(`#${id}`);
    const href = await card.locator(".door-link").getAttribute("href");
    const box = await card.boundingBox();
    // Tap the top-right corner area: away from the visible link text.
    await page.mouse.click(box.x + box.width - 8, box.y + 8);
    if (href.startsWith("#")) {
      await expect(page).toHaveURL(new RegExp(`${href}$`));
    } else if (href.startsWith("http")) {
      await expect(page).toHaveURL(href.endsWith("/") ? href : `${href}/`);
    } else {
      await expect(page).toHaveURL(new RegExp(`${href}(\\.html)?$`));
    }
  }
});

// Keyboard order = screen order: Join first, then the doors row by row.
for (const [w, h] of [[390, 844], [320, 568], [768, 1024], [1440, 900]]) {
  test(`${w}px: Tab reaches Join before the six doors, in the order they appear`, async ({ page }) => {
    await openLa(page, w, h);
    await page.locator('#home .hero-community a').focus(); // last link before #explore
    const seen = [];
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("Tab");
      seen.push(await page.evaluate(() => {
        const a = document.activeElement, card = a.closest(".door-card");
        const b = (card || a).getBoundingClientRect();
        return { id: a.id || card?.id, x: Math.round(b.left + scrollX), y: Math.round(b.top + scrollY) };
      }));
    }
    expect(seen.map((s) => s.id)).toEqual(["explore-join", ...DOOR_ORDER]);
    // Each next stop is further down the page, or to the right on the same row.
    for (let i = 1; i < seen.length; i++) {
      const [p, c] = [seen[i - 1], seen[i]];
      expect(c.y > p.y + 4 || (Math.abs(c.y - p.y) <= 4 && c.x > p.x), `${p.id} → ${c.id}`).toBe(true);
    }
  });
}

test("doors: one link each, so screen readers announce each door once", async ({ page }) => {
  await openLa(page, 390, 844);
  for (const id of DOOR_ORDER) await expect(page.locator(`#${id} a`)).toHaveCount(1);
});

test("homepage search on phones: 🔍 opens the same search, Escape and tapping outside close it", async ({ page, context }) => {
  await context.route(/^https:\/\/[a-z-]+\.geezword\.com\//, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>app</title>" }));
  await openLa(page, 390, 844);
  const toggle = page.locator(".nav-search-toggle");
  const input = page.locator("#searchInput");
  const results = page.locator("#searchResults");
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-label", "Search apps");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  const tb = await toggle.boundingBox();
  expect(tb.width).toBeGreaterThanOrEqual(44);
  expect(tb.height).toBeGreaterThanOrEqual(44);
  await expect(input).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  expect(await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16); // no iPhone zoom
  await expect(results).toBeVisible();
  // Field and results stay on screen; the menu button stays usable.
  const ib = await input.boundingBox(), rb = await results.boundingBox(), mb = await page.locator(".nav-toggle").boundingBox();
  expect(ib.x).toBeGreaterThanOrEqual(0);
  expect(ib.x + ib.width).toBeLessThanOrEqual(mb.x);
  expect(rb.x).toBeGreaterThanOrEqual(0);
  expect(rb.x + rb.width).toBeLessThanOrEqual(390);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "mobile-search-open-390.png") });

  await input.fill("kidase");
  await expect(results.locator(".search-result-item")).not.toHaveCount(0);
  await expect(results).toContainText("Kidase");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
  await expect(results).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();

  // Tapping the button again closes it; tapping outside closes it.
  await toggle.click();
  await expect(input).toBeVisible();
  await toggle.click();
  await expect(input).toBeHidden();
  await toggle.click();
  await expect(input).toBeVisible();
  await page.mouse.click(195, 500);
  await expect(input).toBeHidden();

  // A result still navigates.
  await toggle.click();
  await input.fill("lissan");
  await page.locator("#searchResults .search-result-item").first().click();
  await expect(page).toHaveURL(/lissan\.geezword\.com/);
});

test("other pages keep the search box on phones (homepage only)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const p of ["learn", "type", "downloads", "books", "start"]) {
    await page.goto(`${BASE}/${p}`);
    await expect(page.locator(".nav-search-toggle"), p).toHaveCount(0);
    await expect(page.locator("#searchInput"), p).toBeVisible();
  }
});

test("768px tablet and 1440px desktop: layout unchanged (Join above the doors)", async ({ page }) => {
  for (const [w, h, cols] of [[768, 1024, 2], [1440, 900, 3]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/#explore`);
    await page.waitForTimeout(1200); // let the scroll-reveal fade settle
    const r = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#explore .door-card")];
      const grid = document.querySelector("#explore .door-grid").getBoundingClientRect();
      const j = document.querySelector("#explore-join").getBoundingClientRect();
      const head = document.querySelector("#explore .section-header").getBoundingClientRect();
      return {
        cols: new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))).size,
        joinAboveGrid: j.bottom < grid.top, joinBelowHeader: j.top > head.bottom,
        gapJoinGrid: Math.round(grid.top - j.bottom), gapHeadJoin: Math.round(j.top - head.bottom),
        linkStyle: getComputedStyle(cards[0].querySelector(".door-link")).borderTopWidth,
        toggle: getComputedStyle(document.querySelector(".nav-search-toggle")).display,
        search: getComputedStyle(document.querySelector("#searchInput")).display,
      };
    });
    expect(r.cols).toBe(cols);
    expect(r.joinAboveGrid && r.joinBelowHeader).toBe(true);
    expect(r.gapJoinGrid).toBe(48);     // as before: section-header margin-bottom
    expect(r.gapHeadJoin).toBe(24);     // as before: the join paragraph's margin-top
    expect(r.linkStyle).toBe("2px");    // doors keep their outlined buttons
    expect(r.toggle).toBe("none");
    expect(r.search).not.toBe("none");
  }
});

test("journey: /la → open a door → back → join → registration keeps the LA campaign (emulator)", async ({ page }) => {
  test.skip(!EMULATOR_PORT, "needs the Firestore emulator (npm test)");
  await openLa(page, 390, 844);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("geezword-start-campaign")))).toEqual(CAMPAIGN);
  // Explore a resource first.
  await page.locator("#door-read").click();
  await expect(page).toHaveURL(/\/books(\.html)?$/);
  await page.goBack();
  await expect(page.locator("#explore-join")).toBeVisible();
  // Then join.
  await page.locator("#explore-join").click();
  await page.waitForURL(/\/start#community$/);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("geezword-start-campaign")))).toEqual(CAMPAIGN);
  const email = `la.mobile.${Date.now()}@example.test`;
  await page.goto(`${BASE}/start?firestoreEmulator=${EMULATOR_PORT}#community`);
  const form = page.locator("#community-form");
  await form.locator('input[name="firstName"]').fill("Mobile LA");
  await form.locator('input[name="email"]').fill(email);
  await form.locator("label.lang-radio").filter({ has: page.locator('input[value="en"]') }).click();
  await page.locator("#join-free-button").click();
  await expect(page.locator("#community-success")).toBeVisible({ timeout: 20_000 });
  const url = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/community-signups?pageSize=300`;
  const body = await (await fetch(url, { headers: { Authorization: "Bearer owner" } })).json();
  const doc = (body.documents || []).map((d) => d.fields).find((f) => f.email?.stringValue === email);
  expect(doc, "registration written to the emulator").toBeTruthy();
  expect({ utmSource: doc.utmSource?.stringValue, utmMedium: doc.utmMedium?.stringValue, utmCampaign: doc.utmCampaign?.stringValue }).toEqual(CAMPAIGN);
  expect(Number(doc.formVersion.integerValue)).toBe(3);
});
