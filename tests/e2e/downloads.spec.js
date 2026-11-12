// Browser and repository tests for the Downloads page (/downloads).
// Run through run-e2e.js. No form is ever submitted: every request to
// Mailchimp is intercepted and aborted, and the tests assert none was made.
"use strict";

const { test, expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { start } = require("./static-server");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SITE_PORT = 5282;
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const SHOTS = process.env.E2E_SCREENSHOT_DIR || "";

// The existing Mailchimp embed: must stay exactly as it is.
const MAILCHIMP_ACTION =
  "https://yahoo.us14.list-manage.com/subscribe/post?u=f7d1b2241dd85c9399fa5347d&id=145748da52&f_id=006c61e5f0";
const MAILCHIMP_HONEYPOT = "b_f7d1b2241dd85c9399fa5347d_145748da52";

const INSTALLER_EXT = /\.(exe|msi|kmp|kmx|kvk|dmg|pkg|apk|aab)$/i;
const FONT_OR_ARCHIVE_EXT = /\.(ttf|otf|woff2?|zip|7z|rar)$/i;

let server;
test.beforeAll(async () => { server = await start(SITE_PORT); });
test.afterAll(async () => { await new Promise((r) => server.close(r)); });

// Every test page: record and ABORT anything aimed at Mailchimp.
const mailchimpRequests = [];
test.beforeEach(async ({ page }) => {
  await page.route(/list-manage\.com|mailchimp\.com/, (route) => {
    mailchimpRequests.push(route.request().url());
    return route.abort();
  });
});

async function openDownloads(page) {
  await page.goto(`${BASE}/downloads`);
}

// ---------------------------------------------------------------------------

test("no placeholder links: every link and button has a real destination", async ({ page }) => {
  await openDownloads(page);
  await expect(page.locator('a[href="#"]')).toHaveCount(0);
  const hrefs = await page.locator("main, section, nav, footer").locator("a").evaluateAll((as) =>
    as.map((a) => ({ text: a.textContent.trim().replace(/\s+/g, " "), href: a.getAttribute("href") }))
  );
  expect(hrefs.length).toBeGreaterThan(10);
  for (const { text, href } of hrefs) {
    expect(href, `link "${text}" has no destination`).toBeTruthy();
    expect(href.trim(), `link "${text}"`).not.toBe("#");
    expect(href, `link "${text}"`).not.toMatch(/^javascript:/i);
  }
  // The keyboard's contact link is a real, intentional destination.
  await expect(page.locator("#geezword-desktop a")).toHaveAttribute(
    "href", "mailto:info@geezword.com?subject=Geezword%20Desktop%20Keyboard"
  );
});

test("the desktop keyboard is labelled paid and never called free", async ({ page }) => {
  await openDownloads(page);
  const card = page.locator("#geezword-desktop");
  await expect(card.locator(".tag-paid")).toHaveText("Paid");
  await expect(card).not.toContainText(/\bfree\b/i);
  await expect(card).toContainText("Purchase link coming soon");
  await expect(page.locator("h1")).toHaveText("Keyboards & Fonts");
  await expect(page.locator("h1")).not.toContainText(/free/i);
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description).toMatch(/paid/i);
  expect(description).not.toMatch(/free geezword keyboard/i);
});

test("MIT layouts vs paid installer is explained, and nothing paid is called free", async ({ page }) => {
  await openDownloads(page);
  const card = page.locator("#geezword-desktop");
  await expect(card.locator(".card-licence")).toHaveText(
    "The keyboard layouts themselves are open source under the MIT licence. What you pay for is the ready-to-install Windows package, with updates and support."
  );
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  // Never "free" attached to the installer, keyboard product or a purchase.
  expect(text).not.toMatch(/free (download|installer|keyboard|desktop keyboard|purchase|subscription)/i);
  expect(text).not.toMatch(/(installer|desktop keyboard|purchase) (is|are) free/i);
  expect(text).not.toMatch(/Free Downloads/);
  expect(text).toMatch(/packaged Geezword Desktop Keyboard for Windows is a paid product/);
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(description).toMatch(/paid packaged installer; the keyboard layouts are MIT-licensed/);
});

test("FontMeme is completely removed", async ({ page }) => {
  await openDownloads(page);
  expect((await page.content()).toLowerCase()).not.toContain("fontmeme");
  let repoHits = "";
  try {
    repoHits = execFileSync("git", ["grep", "-il", "fontmeme", "--", ".", ":!tests"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
  } catch (err) {
    if (err.status !== 1) throw err; // git grep exits 1 when nothing matches
  }
  expect(repoHits).toBe("");
});

test("no installer or keyboard package is in the repository or linked from the page", async ({ page }) => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: REPO_ROOT, encoding: "utf8" }).split(/\r?\n/);
  expect(tracked.filter((f) => INSTALLER_EXT.test(f))).toEqual([]);

  await openDownloads(page);
  const hrefs = await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") || ""));
  expect(hrefs.filter((h) => INSTALLER_EXT.test(h.split("?")[0]))).toEqual([]);
});

test("no missing or unapproved font file is offered as a download", async ({ page }) => {
  await openDownloads(page);
  const links = await page.locator("a").evaluateAll((as) =>
    as.map((a) => ({ href: a.getAttribute("href") || "", download: a.hasAttribute("download") }))
  );
  // No same-site font/archive links at all until a font release is approved.
  const local = links.filter((l) => !/^(https?:|mailto:)/i.test(l.href));
  expect(local.filter((l) => FONT_OR_ARCHIVE_EXT.test(l.href.split("?")[0]))).toEqual([]);
  expect(links.filter((l) => l.download)).toEqual([]);
  // The Geez Mahtem card is honest about its state and is not a link.
  const mahtem = page.locator("#geez-mahtem");
  await expect(mahtem).toContainText("Not available to download yet");
  await expect(mahtem.locator("a")).toHaveCount(0);
  expect(await mahtem.evaluate((el) => el.tagName)).toBe("DIV");
});

test("external links open in a new tab safely and are identified as external", async ({ page }) => {
  await openDownloads(page);
  const external = page.locator('section a[href^="http"]');
  const n = await external.count();
  expect(n).toBe(5);
  for (let i = 0; i < n; i++) {
    const a = external.nth(i);
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(a).toHaveAttribute("rel", /noopener/);
    await expect(a).toHaveAttribute("aria-label", /opens .+ in a new tab/);
    await expect(a).toContainText("External site");
  }
});

test("retained external resources respond (network failures reported separately)", async ({ page }) => {
  await openDownloads(page);
  const urls = await page.locator('section a[href^="http"]').evaluateAll((as) => as.map((a) => a.href));
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
  const broken = [];      // confirmed: 404/410, or a 5xx that persists
  const unreachable = []; // network failure (offline, DNS, timeout)
  const blocked = [];     // 401/403/429: the site refuses automated checks
  for (const url of urls) {
    let outcome = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
        outcome = { status: res.status };
        if (res.status < 500) break; // only server errors are retried
      } catch (err) {
        outcome = { network: err.cause?.code || err.name };
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
    }
    if (outcome.network) unreachable.push(`${url} (${outcome.network})`);
    else if ([401, 403, 429].includes(outcome.status)) blocked.push(`${url} → HTTP ${outcome.status}`);
    else if (outcome.status >= 400) broken.push(`${url} → HTTP ${outcome.status}`);
  }
  // A confirmed missing page or persistent server error fails the test.
  expect(broken, "confirmed broken destinations").toEqual([]);
  // Bot protection (e.g. Cloudflare) can refuse scripted requests to pages
  // that work in a browser. Not counted as broken; reported for a manual check.
  if (blocked.length) {
    test.info().annotations.push({ type: "automated-check-blocked", description: blocked.join("; ") });
    console.log(`[downloads] automated check refused (verify manually): ${blocked.join("; ")}`);
  }
  // Pure network failures are not treated as broken links.
  if (unreachable.length) {
    test.info().annotations.push({ type: "network-unavailable", description: unreachable.join("; ") });
    test.skip(unreachable.length === urls.length, `network unavailable: ${unreachable.join("; ")}`);
  }
});

test("the Mailchimp form is unchanged and asks only for an email address", async ({ page }) => {
  await openDownloads(page);
  const form = page.locator("form.download-form");
  await expect(form).toHaveCount(1);
  expect(await form.getAttribute("action")).toBe(MAILCHIMP_ACTION);
  expect((await form.getAttribute("method")).toLowerCase()).toBe("post");
  await expect(form).toHaveAttribute("target", "_blank");
  const names = await form.locator("input").evaluateAll((els) => els.map((e) => e.name));
  expect(names).toEqual(["EMAIL", MAILCHIMP_HONEYPOT]);
  await expect(form.locator('input[name="EMAIL"]')).toHaveAttribute("type", "email");
  await expect(form.locator('input[name="EMAIL"]')).toHaveAttribute("required", "");
  await expect(form.locator('input[type="tel"], input[name*="PHONE" i]')).toHaveCount(0);
  // Accessible name and honest wording.
  await expect(form.locator('input[name="EMAIL"]')).toHaveAttribute("aria-label", /email address/i);
  const banner = page.locator(".feedback-banner");
  await expect(banner).toContainText("not a keyboard purchase");
  await expect(banner).not.toContainText(/access to all downloadable/i);
  await expect(banner.locator('a[href="privacy.html#downloads-signup"]')).toHaveCount(1);
});

test("submitting the empty Mailchimp form is blocked and nothing reaches Mailchimp", async ({ page }) => {
  await openDownloads(page);
  const before = mailchimpRequests.length;
  await page.locator("form.download-form button[type=submit]").click();
  await page.waitForTimeout(1000);
  expect(await page.locator('form.download-form input[name="EMAIL"]').evaluate((el) => el.validity.valueMissing)).toBe(true);
  expect(mailchimpRequests.length).toBe(before);
  expect(page.context().pages()).toHaveLength(1); // no Mailchimp tab opened
});

test("privacy policy discloses the Mailchimp downloads sign-up accurately", async ({ page }) => {
  await page.goto(`${BASE}/privacy`);
  const section = page.locator("#downloads-signup");
  await expect(section).toHaveText("Downloads news sign-up on the website");
  const body = await page.locator("body").innerText();
  expect(body).toMatch(/GeezWord handles personal information in four places/);
  expect(body).toMatch(/Downloads news sign-up at geezword\.com\/downloads: an email address,\s+kept by Mailchimp/);
  expect(body).toMatch(/sends only the\s+email address you enter to Mailchimp/);
  expect(body).toMatch(/separate from Community registration: it is kept by Mailchimp, not in the\s+Firebase database or with Resend/);
});

for (const width of [1440, 390, 320]) {
  test(`layout at ${width}px: no horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: width >= 1000 ? 900 : 844 });
    await openDownloads(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // script.js fades cards in as they scroll into view; scroll the whole page first.
    for (let y = 0; y < 8000; y += 400) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(800);
    const hidden = await page.locator(".app-card").evaluateAll((cards) =>
      cards.filter((c) => Number(getComputedStyle(c).opacity) < 0.5 && !c.classList.contains("preview"))
        .map((c) => c.textContent.trim().slice(0, 40)));
    expect(hidden, "cards still invisible after scrolling").toEqual([]);
    expect(await page.locator(".app-card").count()).toBe(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `downloads-${width}.png`), fullPage: true });
  });
}

test("keyboard: the keyboard contact link, email field and external links take visible focus", async ({ page }) => {
  await openDownloads(page);
  const ringed = () => page.evaluate(() => {
    const s = getComputedStyle(document.activeElement);
    return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
  });
  const reached = new Set();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => {
      const el = document.activeElement;
      if (el.matches('#geezword-desktop a')) return "keyboard-contact";
      if (el.matches('input[name="EMAIL"]')) return "email";
      if (el.matches('a[href="https://fonts.geez.org/"]')) return "first-external";
      return null;
    });
    if (id && !reached.has(id)) {
      expect(await ringed(), `${id} shows a focus indicator`).toBe(true);
      reached.add(id);
    }
  }
  expect([...reached].sort()).toEqual(["email", "first-external", "keyboard-contact"]);
});

test("heading order and no console errors", async ({ page }) => {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await openDownloads(page);
  await page.waitForLoadState("networkidle");
  const levels = await page.evaluate(() =>
    Array.from(document.querySelectorAll("section h1, section h2, section h3, section h4, section h5, section h6"))
      .map((h) => Number(h.tagName[1]))
  );
  expect(levels[0]).toBe(1);
  for (let i = 1; i < levels.length; i++) {
    expect(levels[i] - levels[i - 1], `heading jump at position ${i}: ${levels.join(",")}`).toBeLessThanOrEqual(1);
  }
  const broken = await page.evaluate(() => Array.from(document.images).filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.src));
  expect(broken).toEqual([]);
  expect(errors).toEqual([]);
});

test.afterAll(() => {
  // Belt and braces: across every Downloads test, nothing was sent to Mailchimp.
  expect(mailchimpRequests).toEqual([]);
});
