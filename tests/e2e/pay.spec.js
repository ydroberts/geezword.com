// Tests for the LA book-table Zelle page /pay (pay.html, served by cleanUrls).
// Information only: no forms, no payment integration, no phone-call links, no ads.
"use strict";

const { test, expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");
const { start } = require("./static-server");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SITE_PORT = 5288;
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const SHOTS = process.env.E2E_SCREENSHOT_DIR || "";

const DIGITS = "7138744653";
const SHOWN = "713-874-4653";
const RECIPIENT = "geezword";
const BOOKS = [["Tigrinya for Beginners", "$35"], ["Tigrinya Letter Tracing", "$30"], ["Both books", "$65"]];
const STEPS = [
  "Choose the books you want to purchase.",
  "Open Zelle in your bank's mobile app.",
  "Use the phone number shown above.",
  "Enter the total payment amount.",
  "Verify the recipient's name before sending.",
  "Show the payment confirmation to the book-table attendant.",
];
const NOTICE = "Please wait while the seller verifies receipt of your payment before collecting your books.";
const PHONES = [[320, 568], [375, 667], [390, 844], [430, 932]];
const EXTERNAL = /googlesyndication|doubleclick|googletagmanager|google-analytics|firestore\.googleapis\.com|list-manage/;

let server;
test.beforeAll(async () => { server = await start(SITE_PORT); });
test.afterAll(async () => { await new Promise((r) => server.close(r)); });

const blocked = [];
test.beforeEach(async ({ context }) => {
  await context.route(EXTERNAL, (route) => { blocked.push(route.request().url()); return route.abort(); });
});

// WCAG contrast ratio from two computed rgb()/rgba() colours (alpha ignored: all are opaque here).
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

test("/pay serves the page, out of search results, with no ads, forms or call links", async ({ page }) => {
  const res = await page.goto(`${BASE}/pay`);
  expect(res.status()).toBe(200);
  await expect(page).toHaveTitle(/Pay with Zelle/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('meta[name="format-detection"]')).toHaveAttribute("content", "telephone=no");
  expect(await page.locator('a[href^="tel:"], a[href^="sms:"]').count()).toBe(0);
  expect(await page.locator("form, input, select, textarea").count()).toBe(0);
  expect(await page.locator('script[src*="googlesyndication"], ins.adsbygoogle, iframe').count()).toBe(0);
  expect(await page.locator(".nav-links, #searchInput").count()).toBe(0); // no site menu or search
  expect(blocked).toEqual([]);
});

test("/pay is not linked from the site menu or any other page", async () => {
  const pages = fs.readdirSync(REPO_ROOT).filter((f) => f.endsWith(".html") && f !== "pay.html");
  for (const f of pages) {
    const html = fs.readFileSync(path.join(REPO_ROOT, f), "utf8");
    expect(html, f).not.toMatch(/href="\/?pay(\.html)?["#?]/);
  }
  expect(fs.readFileSync(path.join(REPO_ROOT, "robots.txt"), "utf8")).not.toMatch(/pay/);
});

test("shows the verified Zelle details, books, prices, steps and notice", async ({ page }) => {
  await page.goto(`${BASE}/pay`);
  await expect(page.locator("h1")).toHaveText("Geezword Books — Pay with Zelle");
  await expect(page.locator("#zelle-number")).toHaveText(SHOWN);
  await expect(page.locator("#zelle-recipient")).toHaveText(RECIPIENT);
  expect(await page.locator("#copy-zelle").getAttribute("data-copy")).toBe(DIGITS);
  expect((await page.locator("#zelle-number").textContent()).replace(/\D/g, "")).toBe(DIGITS);

  const rows = await page.locator(".pay-books li").evaluateAll((lis) => lis.map((li) => [
    li.querySelector(".pay-book").firstChild.textContent.trim(), li.querySelector(".pay-price").textContent.trim()]));
  expect(rows).toEqual(BOOKS);

  const steps = await page.locator(".pay-steps li").allTextContents();
  expect(steps).toHaveLength(6);
  steps.forEach((s, i) => expect(s.startsWith(STEPS[i]), s).toBe(true));
  await expect(page.locator(".pay-notice")).toContainText(NOTICE);
  await expect(page.locator(".pay-notice")).toContainText("does not process or confirm payments");
});

test("book prices on /books are unchanged", async () => {
  const books = fs.readFileSync(path.join(REPO_ROOT, "books.html"), "utf8");
  const prices = [...books.matchAll(/class="price-now">([^<]+)</g)].map((m) => m[1]);
  expect(prices).toEqual(["$35.00", "$30.00"]);
});

test("Copy Zelle Number copies the digits only and says so", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await page.goto(`${BASE}/pay`);
  await page.locator("#copy-zelle").click();
  await expect(page.locator("#copy-zelle")).toHaveText("Copied ✓");
  await expect(page.locator("#copy-status")).toHaveText(`Zelle number copied: ${DIGITS}`);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(DIGITS);
  await expect(page.locator("#copy-zelle")).toHaveText("Copy Zelle Number", { timeout: 5000 });
});

test("copy works by keyboard too", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await page.goto(`${BASE}/pay`);
  await page.keyboard.press("Tab"); // logo
  await expect(page.locator(".nav-logo")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#copy-zelle")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#copy-status")).toContainText(DIGITS);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(DIGITS);
});

test("if the phone blocks copying, the number is selected with a hint", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("blocked")) } });
    document.execCommand = () => false;
  });
  await page.goto(`${BASE}/pay`);
  await page.locator("#copy-zelle").click();
  await expect(page.locator("#copy-status")).toContainText("Press and hold the number");
  expect(await page.evaluate(() => String(window.getSelection()))).toBe(SHOWN);
  await expect(page.locator("#copy-zelle")).toHaveText("Copy Zelle Number");
});

for (const [w, h] of PHONES) {
  test(`phone ${w}x${h}: fits, large prices, copy button on the first screen`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/pay`);
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect();
      const num = document.querySelector("#zelle-number");
      return {
        hscroll: document.documentElement.scrollWidth > innerWidth,
        btn: box("#copy-zelle"), card: box(".pay-zelle"), vh: innerHeight,
        numOneLine: num.getBoundingClientRect().height < parseFloat(getComputedStyle(num).fontSize) * 1.8,
        numSize: parseFloat(getComputedStyle(num).fontSize),
        prices: [...document.querySelectorAll(".pay-price")].map((p) => parseFloat(getComputedStyle(p).fontSize)),
        body: Math.min(...[...document.querySelectorAll(".pay-steps li, .pay-book")].map((e) => parseFloat(getComputedStyle(e).fontSize))),
      };
    });
    expect(r.hscroll).toBe(false);
    expect(r.numOneLine).toBe(true);
    expect(r.numSize).toBeGreaterThanOrEqual(32);
    r.prices.forEach((p) => expect(p).toBeGreaterThanOrEqual(32));
    expect(r.body).toBeGreaterThanOrEqual(18);
    expect(r.btn.height).toBeGreaterThanOrEqual(48);
    expect(r.btn.width).toBeGreaterThanOrEqual(w - 80);
    expect(r.btn.bottom).toBeLessThanOrEqual(r.vh);
    expect(r.card.right).toBeLessThanOrEqual(w);
    // Each price sits on the same line as its book title.
    const rows = await page.locator(".pay-books li").evaluateAll((lis) => lis.map((li) => {
      const t = li.querySelector(".pay-book").getBoundingClientRect(), p = li.querySelector(".pay-price").getBoundingClientRect();
      return p.top < t.bottom && p.left > t.left;
    }));
    expect(rows).toEqual([true, true, true]);
    // No automatic hyphenation at normal text size.
    expect(await page.locator(".pay-main").evaluate((m) => getComputedStyle(m).hyphens)).not.toBe("auto");
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `pay-${w}.png`), fullPage: true });
    // Whole-button tap copies on a touch screen, and the button keeps its gold afterwards (no sticky hover).
    const gold = await page.locator("#copy-zelle").evaluate((b) => getComputedStyle(b).backgroundColor);
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    await page.locator("#copy-zelle").tap();
    await expect(page.locator("#copy-status")).toContainText(DIGITS);
    expect(gold).toBe("rgb(212, 160, 39)");
    // The pale hover colour is only for devices with a mouse, so it can't stick after a tap on a phone.
    // (Headless Chromium reports hover even when emulating a phone, so check the rule, not the pointer.)
    const hoverRules = await page.evaluate(() => [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules]; } catch (e) { return []; } })
      .flatMap((r) => r.cssRules ? [...r.cssRules].map((c) => [r.conditionText || "", c.selectorText]) : [["", r.selectorText]])
      .filter(([, sel]) => sel && /\.pay-copy:(hover|active)/.test(sel)));
    expect(hoverRules).toEqual([["(hover: hover)", ".pay-copy:hover"]]);
    if (!(await page.evaluate(() => matchMedia("(hover: hover)").matches))) {
      expect(await page.locator("#copy-zelle").evaluate((b) => getComputedStyle(b).backgroundColor)).toBe(gold);
    }
    expect(await page.evaluate(() => String(window.getSelection()))).toBe("");
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `pay-${w}-copied.png`) });
    await ctx.close();
  });
}

test("accessibility: headings, names, contrast, focus ring, 200% text", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 568 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/pay`);
  expect(await page.locator("html").getAttribute("lang")).toBe("en");
  expect(await page.locator("h1").count()).toBe(1);
  const levels = await page.locator("h1, h2, h3").evaluateAll((hs) => hs.map((x) => Number(x.tagName[1])));
  levels.forEach((l, i) => i && expect(l - levels[i - 1]).toBeLessThanOrEqual(1));
  await expect(page.getByRole("button", { name: "Copy Zelle Number" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("list")).toHaveCount(2);

  const pairs = await page.evaluate(() => {
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return "rgb(255, 255, 255)"; };
    const sel = ["h1", "#zelle-heading", ".pay-label", "#zelle-number", ".pay-recipient", "#copy-zelle", ".pay-book", ".pay-book small", ".pay-price", ".pay-steps li", ".pay-notice p", ".pay-safety", ".pay-footer p", ".pay-footer a", ".pay-header .nav-logo"];
    document.querySelector("#copy-status").textContent = "x";
    sel.push("#copy-status");
    return sel.map((s) => { const e = document.querySelector(s); return [s, getComputedStyle(e).color, bgOf(e)]; });
  });
  // fn is defined in Node; evaluate the ratios here.
  for (const [s, fg, bg] of pairs) expect(contrast(fg, bg), `${s} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);

  await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  const ring = await page.locator("#copy-zelle").evaluate((b) => getComputedStyle(b).outlineStyle + " " + getComputedStyle(b).outlineWidth);
  expect(ring).toBe("solid 3px");

  // 200% text size (WCAG 1.4.4) at the narrowest phone: still no sideways scrolling, button still usable.
  await page.addStyleTag({ content: "html{font-size:200% !important}" });
  const z = await page.evaluate(() => {
    const b = document.querySelector("#copy-zelle").getBoundingClientRect(), card = document.querySelector(".pay-zelle");
    return { hscroll: document.documentElement.scrollWidth > innerWidth, w: b.width, h: b.height, inner: card.clientWidth - parseFloat(getComputedStyle(card).paddingLeft) * 2 };
  });
  expect(z.hscroll).toBe(false);
  expect(Math.abs(z.w - z.inner)).toBeLessThan(1); // still the full width of its card
  expect(z.h).toBeGreaterThanOrEqual(48);
  await ctx.close();
});
