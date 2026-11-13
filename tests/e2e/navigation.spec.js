// Browser tests for the six-item primary menu:
//   Home | Learn & Play | Type & Translate | Downloads | Books | Kidase | Community
// Run through run-e2e.js. Nothing is submitted anywhere.
"use strict";

const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { start } = require("./static-server");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SITE_PORT = 5285;
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const SHOTS = process.env.E2E_SCREENSHOT_DIR || "";

const LABELS = ["Home", "Learn & Play", "Type & Translate", "Downloads", "Books", "Kidase", "Community"];
const EXISTING = ["index", "about", "apps", "books", "challenge", "downloads", "play", "premium", "privacy", "start"];
const PAGES = [...EXISTING, "learn", "type"];
const HOME_HREFS = ["#home", "learn.html", "type.html", "downloads.html", "books.html", "#kidase", "#community"];
const PAGE_HREFS = ["index.html", "learn.html", "type.html", "downloads.html", "books.html", "index.html#kidase", "start.html"];
// Page → [highlighted menu item, aria-current]. A page marks its own item
// "page"; a page inside a section marks that section "true".
const CURRENT = {
  learn: ["Learn & Play", "page"], play: ["Learn & Play", "true"], challenge: ["Learn & Play", "true"],
  type: ["Type & Translate", "page"], downloads: ["Downloads", "page"],
  books: ["Books", "page"], premium: ["Kidase", "true"], start: ["Community", "page"],
};

let server;
test.beforeAll(async () => { server = await start(SITE_PORT); });
test.afterAll(async () => { await new Promise((r) => server.close(r)); });

const read = (file) => fs.readFileSync(path.join(REPO_ROOT, file), "utf8").replace(/\r/g, "");
const onMaster = (file) =>
  execFileSync("git", ["show", `origin/master:${file}`], { cwd: REPO_ROOT, encoding: "utf8" }).replace(/\r/g, "");
const NAV_UL = /(?:[ \t]*<!--[^\n]*-->\n)?[ \t]*<ul class="nav-links[^"]*">[\s\S]*?<\/ul>/;
const FOOTER = /<footer[\s\S]*?<\/footer>/;
const url = (name) => `${BASE}/${name === "index" ? "" : name}`;
const menuLink = (page, label) => page.locator(".navbar .nav-links a").filter({ hasText: new RegExp(`^${label}$`) });

// Blocks out non-essential third-party requests (ads, analytics, Firestore).
async function quiet(page) {
  await page.route(/googlesyndication|doubleclick|googletagmanager|google-analytics|firestore\.googleapis\.com|list-manage\.com/, (r) => r.abort());
}

async function settle(page) {
  let last = -1, still = 0;
  for (let i = 0; i < 60 && still < 4; i++) {
    const y = await page.evaluate(() => scrollY);
    still = y === last ? still + 1 : 0; last = y;
    await page.waitForTimeout(100);
  }
}

// ---- Markup on every page ----
for (const name of PAGES) {
  test(`/${name}: seven menu items, in order, with the right destinations`, async ({ page }) => {
    await quiet(page);
    await page.goto(url(name));
    const links = page.locator(".navbar .nav-links a");
    expect(await links.allInnerTexts()).toEqual(LABELS);
    const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(hrefs).toEqual(name === "index" ? HOME_HREFS : PAGE_HREFS);
    // Community keeps its gold (saffron) highlight and is the only pill.
    await expect(page.locator(".navbar .nav-links a.nav-join")).toHaveText("Community");
    const bg = await page.locator(".navbar .nav-links a.nav-join").evaluate((a) => getComputedStyle(a).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
    // Superseded items are not in the header.
    for (const gone of ["Apps", "Keyboard", "About", "Teach", "Start", "Keyboards"]) {
      await expect(menuLink(page, gone)).toHaveCount(0);
    }
    await expect(page.locator(".navbar #searchInput")).toHaveCount(1);
    // Active-page indicator (homepage: scroll-spy, checked separately).
    if (name !== "index") {
      const lit = await page.locator(".navbar .nav-links a.active").evaluateAll((as) => as.map((a) => [a.textContent.trim(), a.getAttribute("aria-current")]));
      expect(lit).toEqual(CURRENT[name] ? [CURRENT[name]] : []);
    }
  });
}

test("existing pages changed only in the header menu; footers untouched", async () => {
  const CONTENT_CHANGED = new Set(["index", "apps"]); // homepage discovery + All Apps keyboard wording (la-release.spec.js)
  for (const name of EXISTING) {
    if (CONTENT_CHANGED.has(name)) {
      expect(read(name + ".html").match(FOOTER)[0], name + ".html footer").toBe(onMaster(name + ".html").match(FOOTER)[0]);
      continue;
    }
    const file = `${name}.html`;
    const now = read(file), before = onMaster(file);
    expect(now.match(FOOTER)[0], `${file} footer`).toBe(before.match(FOOTER)[0]);
    expect(now.replace(NAV_UL, "<NAV/>"), `${file} outside the menu`).toBe(before.replace(NAV_UL, "<NAV/>"));
  }
});

test("footer keeps Books and About on every page; Books reaches GeezAlphabet.com", async ({ page }) => {
  await quiet(page);
  for (const name of PAGES) {
    await page.goto(url(name));
    await expect(page.locator('footer a[href="books.html"]')).toHaveText("Books");
    await expect(page.locator('footer a[href="about.html"]')).toHaveText("About");
  }
  await page.goto(`${BASE}/books`);
  expect(await page.locator('a[href^="https://www.geezalphabet.com"]').count()).toBeGreaterThanOrEqual(1);
});

// ---- Every menu item navigates correctly ----
const TARGETS = [
  { label: "Home", path: /^\/(index(\.html)?)?$/, check: "#home" },
  { label: "Learn & Play", path: /^\/learn(\.html)?$/, check: ".hero h1", text: "Learn & Play" },
  { label: "Type & Translate", path: /^\/type(\.html)?$/, check: ".hero h1", text: "Type & Translate" },
  { label: "Downloads", path: /^\/downloads(\.html)?$/, check: ".hero h1", text: "Keyboards & Fonts" },
  { label: "Books", path: /^\/books(\.html)?$/, check: ".hero h1", text: "Books" },
  { label: "Kidase", path: /^\/(index(\.html)?)?$/, hash: "#kidase", check: "#kidase", inView: true },
  { label: "Community", path: /^\/start(\.html)?$/, check: "#community-form" },
];
for (const t of TARGETS) {
  test(`clicking "${t.label}" from /about lands on its destination`, async ({ page }) => {
    await quiet(page);
    await page.goto(`${BASE}/about`);
    await menuLink(page, t.label).click();
    await page.waitForURL((u) => t.path.test(u.pathname) && u.hash === (t.hash || ""), { waitUntil: "load" });
    const target = page.locator(t.check).first();
    await expect(target).toHaveCount(1);
    if (t.text) await expect(target).toHaveText(t.text);
    if (t.inView) {
      await settle(page);
      const { top, nav, bottom } = await target.evaluate((el) => ({
        top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom,
        nav: document.querySelector(".navbar").getBoundingClientRect().bottom,
      }));
      expect(top).toBeGreaterThanOrEqual(nav);
      expect(bottom).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
    }
  });
}

test("homepage: Home is lit at the top; Kidase and Community light when scrolled to", async ({ page }) => {
  await quiet(page);
  await page.goto(`${BASE}/`);
  const lit = () => page.locator('.navbar .nav-links a[aria-current]').allInnerTexts();
  expect(await lit()).toEqual(["Home"]);
  for (const [label, id] of [["Kidase", "#kidase"], ["Community", "#community"]]) {
    await menuLink(page, label).click();
    await settle(page);
    expect(await lit()).toEqual([label]);
    expect(new URL(page.url()).hash).toBe(id);
  }
  await menuLink(page, "Learn & Play").click();
  await expect(page).toHaveURL(/\/learn(\.html)?$/);
});

test("every menu destination returns 200 and every in-page target exists", async ({ request }) => {
  for (const p of ["/", "/learn", "/learn.html", "/type", "/type.html", "/books", "/books.html", "/start", "/start.html"]) {
    expect((await request.get(`${BASE}${p}`)).status(), p).toBe(200);
  }
  for (const id of ["home", "kidase", "community", "explore"]) expect(read("index.html")).toMatch(new RegExp(`id="${id}"`));
});

test("apps catalog and downloads links are all still on their pages", async ({ page }) => {
  await quiet(page);
  for (const name of ["apps", "downloads"]) {
    const before = onMaster(`${name}.html`).replace(NAV_UL, "").replace(/<!--[\s\S]*?-->/g, ""); // hidden cards are commented out
    const old = [...before.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map((m) => m[1]);
    expect(old.length).toBeGreaterThan(10);
    await page.goto(`${BASE}/${name}`);
    const now = new Set(await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href"))));
    expect(old.filter((h) => !now.has(h)), `${name}: links lost`).toEqual([]);
  }
});

// ---- Desktop fit ----
for (const width of [941, 960, 1024, 1100, 1180, 1181, 1280, 1440]) {
  test(`desktop ${width}px: one row, no overlap with the logo or search, no horizontal scroll`, async ({ page }) => {
    await quiet(page);
    await page.setViewportSize({ width, height: 800 });
    for (const name of ["index", "learn", "about"]) {
      await page.goto(url(name));
      const m = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        const items = [...document.querySelectorAll(".navbar .nav-links a")].map((a) => a.getBoundingClientRect());
        return {
          tops: items.map((b) => Math.round(b.top + b.height / 2)),
          wrapped: items.some((b) => b.height > 48),
          menu: r(".navbar .nav-links"), logo: r(".nav-logo"), search: r(".nav-search"),
          toggleShown: getComputedStyle(document.querySelector(".nav-toggle")).display !== "none",
          scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
          barH: r(".navbar").height,
        };
      });
      expect(new Set(m.tops).size, `${name}: items on one row`).toBe(1);
      expect(m.wrapped, `${name}: no label wraps`).toBe(false);
      expect(m.menu.left, `${name}: menu clear of logo`).toBeGreaterThanOrEqual(m.logo.right + 8);
      expect(m.search.left, `${name}: search clear of menu`).toBeGreaterThanOrEqual(m.menu.right + 8);
      expect(m.toggleShown).toBe(false);
      expect(m.scrollW).toBeLessThanOrEqual(m.innerW);
      expect(Math.round(m.barH)).toBe(65);
      // Focusing search widens it; the row must still fit without scrolling.
      await page.locator("#searchInput").focus();
      await page.waitForTimeout(350);
      const f = await page.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        return { menu: r(".navbar .nav-links"), logo: r(".nav-logo"), search: r(".nav-search"), scrollW: document.documentElement.scrollWidth, innerW: innerWidth };
      });
      expect(f.menu.left, `${name}: focused, menu clear of logo`).toBeGreaterThanOrEqual(f.logo.right + 8);
      expect(f.search.left, `${name}: focused, search clear of menu`).toBeGreaterThanOrEqual(f.menu.right + 8);
      expect(f.scrollW, `${name}: focused, no horizontal scroll`).toBeLessThanOrEqual(f.innerW);
    }
    if (SHOTS) {
      await page.goto(`${BASE}/`);
      await page.screenshot({ path: path.join(SHOTS, `nav-home-${width}.png`), clip: { x: 0, y: 0, width, height: 80 } });
      await page.goto(`${BASE}/learn`);
      await page.screenshot({ path: path.join(SHOTS, `nav-learn-${width}.png`), clip: { x: 0, y: 0, width, height: 80 } });
    }
  });
}

test("desktop: Tab moves through the seven items in order with a visible focus ring", async ({ page }) => {
  await quiet(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/about`);
  await page.locator(".nav-logo").focus();
  const seen = [];
  for (let i = 0; i < LABELS.length; i++) {
    await page.keyboard.press("Tab");
    seen.push(await page.evaluate(() => {
      const a = document.activeElement, cs = getComputedStyle(a);
      return { text: a.textContent.trim(), ring: cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 };
    }));
  }
  expect(seen.map((s) => s.text)).toEqual(LABELS);
  expect(seen.every((s) => s.ring)).toBe(true);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement.id)).toBe("searchInput");
});

// ---- Mobile ----
// Phones and portrait tablets (940px and below) use the menu button.
for (const [w, h] of [[390, 844], [320, 568], [768, 1024], [820, 1180], [940, 800]]) {
  test(`mobile/tablet ${w}x${h}: toggle opens an accessible menu; items are 44px targets; choosing one closes it`, async ({ page }) => {
    await quiet(page);
    await page.setViewportSize({ width: w, height: h });
    for (const name of ["index", "learn", "type"]) {
      await page.goto(url(name));
      const toggle = page.locator(".nav-toggle");
      const menu = page.locator(".navbar .nav-links");
      await expect(toggle).toBeVisible();
      await expect(menu).toBeHidden();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toHaveAttribute("aria-controls", await menu.getAttribute("id"));
      await expect(page.locator(".navbar #searchInput")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

      // Keyboard: focus the button and press Enter.
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(menu).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      const boxes = await menu.locator("a").evaluateAll((as) => as.map((a) => {
        const b = a.getBoundingClientRect(); return { h: b.height, r: b.right, text: a.textContent.trim() };
      }));
      expect(boxes.map((b) => b.text)).toEqual(LABELS);
      for (const b of boxes) { expect(b.h).toBeGreaterThanOrEqual(44); expect(b.r).toBeLessThanOrEqual(w); }
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `nav-mobile-${name}-${w}.png`) });

      // Escape closes it and returns focus to the button.
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(await page.evaluate(() => document.activeElement.classList.contains("nav-toggle"))).toBe(true);
    }
    // Choosing an item navigates and the menu is closed on arrival.
    await page.goto(`${BASE}/about`);
    await page.locator(".nav-toggle").click();
    await menuLink(page, "Type & Translate").click();
    await expect(page).toHaveURL(/\/type(\.html)?$/);
    await expect(page.locator(".navbar .nav-links")).toBeHidden();
    // An in-page item (Kidase on the homepage) closes the menu too.
    await page.goto(`${BASE}/`);
    await page.locator(".nav-toggle").click();
    await menuLink(page, "Kidase").click();
    await expect(page.locator(".navbar .nav-links")).toBeHidden();
    await expect(page.locator(".nav-toggle")).toHaveAttribute("aria-expanded", "false");
  });
}

test("header search still finds apps", async ({ page }) => {
  await quiet(page);
  await page.goto(`${BASE}/about`);
  await page.locator("#searchInput").fill("kidase");
  await expect(page.locator("#searchResults")).toContainText("Kidase");
});

// Inner-page headers line up with the logo and content on every screen width.
for (const width of [390, 1280, 1440, 1920, 2552]) {
  test(`page headers align with the logo at ${width}px`, async ({ page }) => {
    await quiet(page);
    await page.setViewportSize({ width, height: 900 });
    for (const name of ["apps", "books", "downloads", "learn", "type"]) {
      await page.goto(`${BASE}/${name}`);
      const m = await page.evaluate(() => {
        const L = (s) => document.querySelector(s).getBoundingClientRect().left;
        const p = document.querySelector(".hero p").getBoundingClientRect();
        return { h1: L(".hero h1"), logo: L(".nav-logo"), content: L(".section .container"), pWidth: p.width, scrollW: document.documentElement.scrollWidth, innerW: innerWidth };
      });
      expect(Math.abs(m.h1 - m.logo), `${name}: heading vs logo`).toBeLessThanOrEqual(2);
      expect(Math.abs(m.h1 - m.content), `${name}: heading vs content`).toBeLessThanOrEqual(2);
      expect(m.pWidth, `${name}: intro keeps its line length`).toBeLessThanOrEqual(640);
      expect(m.scrollW).toBeLessThanOrEqual(m.innerW);
    }
  });
}
