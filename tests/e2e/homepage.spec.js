// Browser tests for the homepage front doors ("What would you like to do?").
// Run through run-e2e.js. Nothing is submitted anywhere.
"use strict";

const { test, expect } = require("@playwright/test");
const path = require("path");
const { execFileSync } = require("child_process");
const { start } = require("./static-server");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SITE_PORT = 5283;
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const SHOTS = process.env.E2E_SCREENSHOT_DIR || "";

const DOORS = [
  { id: "door-learn", name: "Learn", label: "Start learning →", href: "#learn-paths" },
  { id: "door-play", name: "Play", label: "Play free →", href: "/play" },
  { id: "door-read", name: "Read", label: "Explore books →", href: "/books" },
  { id: "door-type", name: "Type", label: "Get keyboards & fonts →", href: "/downloads" },
  { id: "door-kidase", name: "Kidase", label: "Explore Kidase →", href: "https://kidase.geezword.com" },
  { id: "door-teach", name: "Teach", label: "Teaching resources →", href: "#teach" },
];

let server;
test.beforeAll(async () => { server = await start(SITE_PORT); });
test.afterAll(async () => { await new Promise((r) => server.close(r)); });

async function openHome(page, hash = "") {
  await page.goto(`${BASE}/${hash}`);
}

async function scrollSettled(page) {
  let last = -1, still = 0;
  for (let i = 0; i < 60 && still < 3; i++) {
    const y = await page.evaluate(() => window.scrollY);
    still = y === last ? still + 1 : 0;
    last = y;
    await page.waitForTimeout(100);
  }
}

// Links in a page's HTML (as authored), excluding stylesheets/fonts.
function hrefsIn(html) {
  return [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
}

// ---------------------------------------------------------------------------

test("front-door section: heading, intro and exactly six doors in order", async ({ page }) => {
  await openHome(page);
  const section = page.locator("#explore");
  await expect(section.locator("h2")).toHaveText("What would you like to do?");
  await expect(section).toContainText("Choose what you want to explore today.");
  await expect(page.getByText("What would you like to learn?")).toHaveCount(0);
  const doors = section.locator(".door-card");
  await expect(doors).toHaveCount(6);
  expect(await doors.locator("h3").allInnerTexts()).toEqual(DOORS.map((d) => d.name));
});

test("every door has one intentional destination", async ({ page }) => {
  await openHome(page);
  for (const d of DOORS) {
    const link = page.locator(`#${d.id} a`);
    await expect(link, d.name).toHaveCount(1);
    await expect(link, d.name).toHaveText(d.label);
    const href = await link.getAttribute("href");
    expect(href, d.name).toBe(d.href);
    expect(href.trim(), d.name).not.toBe("#");
    expect(href, d.name).not.toMatch(/^javascript:/i);
    expect(href, d.name).not.toMatch(/utm_/); // no unapproved tracking on homepage links
  }
});

test("door destinations resolve: pages, anchors and the Kidase app", async ({ page, request }) => {
  await openHome(page);
  for (const d of DOORS) {
    if (d.href.startsWith("#")) {
      await expect(page.locator(d.href), `${d.name} anchor`).toHaveCount(1);
    } else if (d.href.startsWith("/")) {
      const res = await request.get(`${BASE}${d.href}`);
      expect(res.status(), `${d.name} → ${d.href}`).toBe(200);
    }
  }
  // External Kidase app: confirmed broken fails; pure network failure is reported, not failed.
  let outcome;
  try {
    const res = await fetch("https://kidase.geezword.com", { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    outcome = res.status;
  } catch (err) {
    outcome = `network: ${err.cause?.code || err.name}`;
  }
  if (typeof outcome === "number") expect(outcome, "kidase.geezword.com").toBeLessThan(400);
  else test.info().annotations.push({ type: "network-unavailable", description: `kidase.geezword.com (${outcome})` });
});

test("Learn door leads to Tigrinya, Amharic and Geez learning choices", async ({ page }) => {
  await openHome(page);
  await page.locator("#door-learn a").click();
  await scrollSettled(page);
  const learn = page.locator("#learn-paths");
  await expect(learn.locator("h2")).toHaveText("Start learning");
  await expect(learn.locator(".path-card h3")).toHaveText(["Tigrinya", "Amharic", "Geez & Kidase"]);
  const hrefs = await learn.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  for (const h of ["https://tigrinya-for-beginners.geezword.com", "https://lissan.geezword.com",
                   "https://kidase.geezword.com", "/challenge", "https://tracing.geezword.com",
                   "https://universe.geezword.com", "https://quest.geezword.com"]) {
    expect(hrefs, h).toContain(h);
  }
  // Ethiopic language names stay large enough to read.
  const px = await learn.locator(".path-native").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(px).toBeGreaterThanOrEqual(18);
});

test("hero identity is preserved and the main button goes to the doors", async ({ page }) => {
  await openHome(page);
  const h1 = page.locator("#home h1");
  await expect(h1).toContainText("Learn Your Language. Keep Your Roots.");
  await expect(h1).not.toContainText("Language, Keep");
  await expect(h1.locator(".geez-script")).toHaveCount(1);
  await expect(page.locator("#home .hero-fidel")).toHaveCount(5);
  const habi = page.locator("#home img.hero-habi");
  await expect(habi).toHaveAttribute("src", "images/habi-waving.png");
  expect(await habi.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator("#home .hero-buttons a").first()).toHaveAttribute("href", "#explore");
  await expect(page.locator("#home .hero-buttons a").first()).toHaveText("Start Exploring →");
  await expect(page.locator('#home .hero-buttons a[href="/play"]')).toHaveText("Play Free");
  await expect(page.locator(".nav-logo")).toHaveText("GeezWord");
});

test("Community stays available but is not a door", async ({ page }) => {
  await openHome(page);
  await expect(page.locator('#home .hero-community a[href="/start#community"]')).toHaveCount(1);
  await expect(page.locator("#community .community-band a.btn")).toHaveAttribute("href", "/start#community");
  await expect(page.locator('.nav-links a[href="#community"]')).toHaveCount(1);
  const doorHrefs = await page.locator("#explore a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(doorHrefs.some((h) => /start/.test(h))).toBe(false);
  // The hero's primary button is exploration, not registration.
  await expect(page.locator("#home .hero-buttons a.btn-primary")).not.toHaveAttribute("href", /start/);
});

test("no existing homepage destination was lost", async ({ page }) => {
  const before = execFileSync("git", ["show", "origin/master:index.html"], { cwd: REPO_ROOT, encoding: "utf8" });
  const oldHrefs = new Set(hrefsIn(before).filter((h) => !/fonts\.(googleapis|gstatic)/.test(h)));
  await openHome(page);
  const now = new Set(await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href"))));
  // Approved replacements: the simplified Community form ignores ?interest=.
  const REPLACED = { "/start?interest=childrens-learning#community": "/start#community" };
  // Approved menu simplification: these section links left the header menu
  // (the sections themselves stay on the page; checked below).
  const LEFT_MENU = new Set(["#apps", "#teach", "#books"]);
  const lost = [...oldHrefs].filter((h) => !LEFT_MENU.has(h) && !now.has(REPLACED[h] || h));
  expect(lost, "links present on master but missing now").toEqual([]);
  // Every product/app card is still there.
  await expect(page.locator("#apps .app-card")).toHaveCount(9);
  await expect(page.locator("#books .book-card")).toHaveCount(2);
  await expect(page.locator("#teach .teach-card")).toHaveCount(2);
  await expect(page.locator("#kidase a[href='/premium']")).toHaveCount(1);
});

test("no homepage link carries the ignored ?interest= parameter; Teach updates go to the simplified form", async ({ page, request }) => {
  await openHome(page);
  const hrefs = await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(hrefs.filter((h) => /[?&]interest=/.test(h))).toEqual([]);
  const updates = page.locator("#teach a", { hasText: "Get updates for parents" });
  await expect(updates).toHaveAttribute("href", "/start#community");
  const res = await request.get(`${BASE}/start`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('id="community-form"');
  expect(html).not.toContain('name="interests"'); // the simplified form
});

test("homepage uses the six-item primary menu (full checks in navigation.spec.js)", async ({ page }) => {
  await openHome(page);
  expect(await page.locator(".nav-links a").allInnerTexts()).toEqual(["Home", "Learn & Play", "Type & Translate", "Books", "Kidase", "Community"]);
  // Sections that left the menu are still on the page.
  for (const id of ["#apps", "#teach", "#books"]) await expect(page.locator(id)).toHaveCount(1);
});

test("all internal homepage links resolve", async ({ page, request }) => {
  await openHome(page);
  const hrefs = [...new Set(await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href"))))];
  expect(hrefs.every((h) => h && h.trim() !== "#" && !/^javascript:/i.test(h))).toBe(true);
  for (const h of hrefs) {
    if (/^(https?:|mailto:)/i.test(h)) continue;
    if (h.startsWith("#")) {
      await expect(page.locator(h), h).toHaveCount(1);
      continue;
    }
    const url = new URL(h, `${BASE}/`);
    const res = await request.get(url.href);
    expect(res.status(), h).toBe(200);
    if (url.hash && url.pathname === "/") await expect(page.locator(url.hash), h).toHaveCount(1);
  }
});

for (const [w, h] of [[1440, 900], [390, 844], [320, 844]]) {
  test(`layout at ${w}px: doors readable, no horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openHome(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const cols = await page.locator("#explore .door-card").evaluateAll((cards) =>
      new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left))).size);
    expect(cols).toBe(w >= 1000 ? 3 : 1);
    const narrowest = await page.locator("#explore .door-card").evaluateAll((cards) =>
      Math.min(...cards.map((c) => c.getBoundingClientRect().width)));
    expect(narrowest).toBeGreaterThanOrEqual(250);
    const glyphPx = await page.locator(".door-glyph").first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(glyphPx).toBeGreaterThanOrEqual(20);
    // Habi keeps its proportions.
    const habi = await page.locator("img.hero-habi").evaluate((img) => {
      const r = img.getBoundingClientRect();
      return r.width && img.naturalWidth ? Math.abs(r.width / r.height - img.naturalWidth / img.naturalHeight) : 0;
    });
    expect(habi).toBeLessThan(0.02);
    if (SHOTS) {
      // script.js fades sections in on scroll; scroll through first so the capture shows them.
      for (let y = 0; y < 12000; y += 500) { await page.evaluate((t) => window.scrollTo(0, t), y); await page.waitForTimeout(40); }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(SHOTS, `home-${w}.png`), fullPage: true });
      if (w === 1440) await page.locator("#explore").screenshot({ path: path.join(SHOTS, "home-doors-1440.png") });
    }
  });
}

for (const target of ["#explore", "#learn-paths", "#teach", "#books", "#kidase", "#community"]) {
  test(`anchor ${target} lands below the sticky navigation`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHome(page, target);
    await scrollSettled(page);
    const top = await page.locator(`${target} h2`).first().evaluate((el) => el.getBoundingClientRect().top);
    const nav = await page.evaluate(() => document.querySelector(".navbar").getBoundingClientRect().bottom);
    expect(top).toBeGreaterThanOrEqual(nav);
  });
}

test("keyboard: the six doors are reached in order with visible focus", async ({ page }) => {
  await openHome(page);
  const order = [];
  for (let i = 0; i < 40 && order.length < 6; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      const card = el.closest && el.closest(".door-card");
      if (!card) return null;
      const s = getComputedStyle(el);
      return { id: card.id, ring: (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none") };
    });
    if (r) {
      expect(r.ring, `${r.id} focus visible`).toBe(true);
      order.push(r.id);
      if (SHOTS && r.id === "door-type") {
        await page.locator("#explore").screenshot({ path: path.join(SHOTS, "home-doors-focus.png") });
      }
    }
  }
  expect(order).toEqual(DOORS.map((d) => d.id));
});

test("site search: results close when keyboard focus leaves or Escape is pressed; no dead entries", async ({ page, request }) => {
  await openHome(page);
  const input = page.locator("#searchInput");
  const results = page.locator("#searchResults");
  await input.focus();
  await expect(results).toHaveClass(/open/);
  // Every listed result points somewhere that exists.
  const urls = [...new Set(await results.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href"))))];
  expect(urls.some((u) => /playground/i.test(u))).toBe(false);
  for (const u of urls.filter((x) => !/^https?:/i.test(x))) {
    const res = await request.get(new URL(u, `${BASE}/`).href);
    expect(res.status(), u).toBe(200);
  }
  // Escape closes and focus stays in the search box.
  await page.keyboard.press("Escape");
  await expect(results).not.toHaveClass(/open/);
  await expect(input).toBeFocused();
  // Reopen, then tab away past the results: the panel closes.
  await input.fill("geez");
  await expect(results).toHaveClass(/open/);
  const count = await results.locator("a").count();
  for (let i = 0; i <= count + 1; i++) await page.keyboard.press("Tab");
  await expect(results).not.toHaveClass(/open/);
});

test("heading order across the page is valid", async ({ page }) => {
  await openHome(page);
  const levels = await page.evaluate(() =>
    Array.from(document.querySelectorAll("body > section h1, body > section h2, body > section h3, body > section h4, body > section h5, body > section h6"))
      .map((h) => Number(h.tagName[1])));
  expect(levels[0]).toBe(1);
  for (let i = 1; i < levels.length; i++) {
    expect(levels[i] - levels[i - 1], `jump at ${i}: ${levels.join(",")}`).toBeLessThanOrEqual(1);
  }
});

test("reduced motion is respected and there are no console errors or broken images", async ({ page }) => {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHome(page);
  await page.waitForLoadState("networkidle");
  const dur = await page.locator(".hero-fidel").first().evaluate((el) => getComputedStyle(el).animationDuration);
  expect(["0s", "0.001s", "1ms"]).toContain(dur);
  for (let y = 0; y < 12000; y += 600) { await page.evaluate((t) => window.scrollTo(0, t), y); await page.waitForTimeout(30); }
  await page.waitForLoadState("networkidle");
  const broken = await page.evaluate(() => Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
  expect(broken).toEqual([]);
  expect(errors).toEqual([]);
});
