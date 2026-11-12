// Browser tests for the simplified Community registration form on /start.
// Run through run-e2e.js (Firestore emulator, demo- project). See that file.
"use strict";

const { test, expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");
const { start, resolveFile, TYPES } = require("./static-server");

const PROJECT_ID = "demo-geezword-test";
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST; // set by emulators:exec
const SITE_PORT = 5281;
const SHOTS = process.env.E2E_SCREENSHOT_DIR || ""; // optional, outside the repo

if (!EMULATOR_HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST is not set — run with `npm test` (emulator only).");
}
const EMULATOR_PORT = EMULATOR_HOST.split(":").pop();
const BASE = `http://127.0.0.1:${SITE_PORT}`;
const FIRESTORE_ROUTE = new RegExp(`127\\.0\\.0\\.1:${EMULATOR_PORT}/google\\.firestore`);

let server;
test.beforeAll(async () => { server = await start(SITE_PORT); });
test.afterAll(async () => { await new Promise((r) => server.close(r)); });

// ---------------------------------------------------------------- helpers
const uniqueEmail = (label) => `${label}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.test`;

function startUrl(query = "") {
  const q = new URLSearchParams(query);
  q.set("firestoreEmulator", EMULATOR_PORT);
  return `${BASE}/start?${q.toString()}#community`;
}

// All community-signups docs in the emulator for one email (admin read: the
// emulator accepts "Bearer owner" and bypasses the security rules).
async function signupsFor(email) {
  const url = `http://${EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/community-signups?pageSize=300`;
  const res = await fetch(url, { headers: { Authorization: "Bearer owner" } });
  const body = await res.json();
  return (body.documents || [])
    .map((d) => d.fields)
    .filter((f) => f.email && f.email.stringValue === email)
    .map((f) => ({
      firstName: f.firstName?.stringValue,
      email: f.email?.stringValue,
      preferredEmailLanguage: f.preferredEmailLanguage?.stringValue,
      interests: (f.interests?.arrayValue?.values || []).map((v) => v.stringValue),
      formVersion: Number(f.formVersion?.integerValue),
      source: f.source?.stringValue,
      utmSource: f.utmSource?.stringValue,
      utmMedium: f.utmMedium?.stringValue,
      utmCampaign: f.utmCampaign?.stringValue,
      keys: Object.keys(f).sort(),
    }));
}

async function fillForm(page, { firstName = "Test", email, language = "en" }) {
  const form = page.locator("#community-form");
  await form.locator('input[name="firstName"]').fill(firstName);
  await form.locator('input[name="email"]').fill(email);
  if (language) {
    // The radio itself is visually hidden (custom styled); click its label as a visitor does.
    await form.locator("label.lang-radio")
      .filter({ has: page.locator(`input[value="${language}"]`) })
      .click();
    await expect(form.locator(`input[name="preferredEmailLanguage"][value="${language}"]`)).toBeChecked();
  }
}

async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

// Wait until the page has stopped (smooth-)scrolling.
async function scrollSettled(page) {
  let last = -1, still = 0;
  for (let i = 0; i < 60 && still < 3; i++) {
    const y = await page.evaluate(() => window.scrollY);
    still = y === last ? still + 1 : 0;
    last = y;
    await page.waitForTimeout(100);
  }
}

// Bottom edge of the sticky navigation bar, in viewport pixels.
async function navBottom(page) {
  return page.evaluate(() => document.querySelector(".navbar").getBoundingClientRect().bottom);
}

// Watches where Firestore traffic goes. Every request to Google APIs is
// ABORTED before it leaves the browser, so nothing can reach production.
async function watchFirestore(page) {
  const seen = { emulator: [], google: [] };
  await page.route(/googleapis\.com/, (route) => {
    const url = route.request().url();
    if (/firestore\.googleapis\.com/.test(url)) seen.google.push(url); // fonts etc. are not counted
    return route.abort();
  });
  page.on("request", (req) => {
    if (FIRESTORE_ROUTE.test(req.url())) seen.emulator.push(req.url());
  });
  return seen;
}

// ------------------------------------------------------------------ tests

test("form shows name, email and language only — no interest checkboxes", async ({ page }) => {
  await page.goto(startUrl());
  const form = page.locator("#community-form");
  await expect(form.locator('input[name="interests"]')).toHaveCount(0);
  await expect(form.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(page.locator("#interests-fieldset")).toHaveCount(0);
  await expect(page.getByText("What would you like to hear about?")).toHaveCount(0);

  const first = form.locator('input[name="firstName"]');
  const email = form.locator('input[name="email"]');
  await expect(first).toBeVisible();
  await expect(first).toHaveAttribute("autocomplete", "given-name");
  await expect(first).toHaveAttribute("required", "");
  await expect(email).toBeVisible();
  await expect(email).toHaveAttribute("autocomplete", "email");
  await expect(email).toHaveAttribute("type", "email");
  await expect(form.locator('input[name="preferredEmailLanguage"]')).toHaveCount(3);
  for (const v of ["ti", "am", "en"]) {
    await expect(form.locator(`input[name="preferredEmailLanguage"][value="${v}"]`)).toHaveAttribute("required", "");
  }
  await expect(page.locator("#join-free-button")).toContainText("Join Free");
  await expect(form.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "privacy.html");
  await expect(form).toContainText("Registration is for adults");
});

test("language is required: no write and an error when none is chosen", async ({ page }) => {
  const email = uniqueEmail("nolang");
  await page.goto(startUrl());
  await fillForm(page, { email, language: null });
  await page.locator("#join-free-button").click();
  await expect(page.locator("#language-error")).toBeVisible();
  await expect(page.locator("#community-success")).toBeHidden();
  await page.waitForTimeout(1500);
  expect(await signupsFor(email)).toHaveLength(0);
});

test("submission sends formVersion 3, exactly [\"general\"], and the UTM tags; ?interest= is ignored", async ({ page }) => {
  const email = uniqueEmail("payload");
  await page.goto(startUrl("utm_source=Test&utm_medium=manual&utm_campaign=Simplified-Form-Check&interest=games"));
  await fillForm(page, { firstName: "Abeba", email, language: "ti" });
  await page.locator("#join-free-button").click();
  await expect(page.locator("#community-success")).toBeVisible({ timeout: 20_000 });

  const docs = await signupsFor(email);
  expect(docs).toHaveLength(1);
  const d = docs[0];
  expect(d.formVersion).toBe(3);
  expect(d.interests).toEqual(["general"]);
  expect(d.preferredEmailLanguage).toBe("ti");
  expect(d.firstName).toBe("Abeba");
  expect(d.source).toBe("start-page");
  expect(d.utmSource).toBe("test");
  expect(d.utmMedium).toBe("manual");
  expect(d.utmCampaign).toBe("simplified-form-check");
  expect(d.keys).toEqual(
    ["createdAt", "email", "firstName", "formVersion", "interests", "preferredEmailLanguage",
     "source", "utmCampaign", "utmMedium", "utmSource"]
  );
});

test("confirmation shows the submitted email and chosen language, and no topics", async ({ page }) => {
  const email = uniqueEmail("confirm");
  await page.goto(startUrl());
  await fillForm(page, { firstName: "Yemane", email, language: "am" });
  await page.locator("#join-free-button").click();

  const success = page.locator("#community-success");
  await expect(success).toBeVisible({ timeout: 20_000 });
  await expect(success.locator("h3")).toHaveText("Welcome, Yemane!");
  await expect(success).toContainText("You’re on the list. We’ll keep you informed about new learning resources, books, apps and important Geezword announcements.");
  await expect(success).toContainText(`Registered email: ${email}`);
  await expect(page.locator("#success-email")).toHaveText(email);
  await expect(success).toContainText("We’ll send your Geezword emails in Amharic.");
  await expect(success).not.toContainText("Your topics");
  await expect(success).not.toContainText("topic");
  await expect(page.locator("#community-form")).toBeHidden();
});

test("success appears only after Firestore confirms the write", async ({ page }) => {
  const email = uniqueEmail("delayed");
  let release;
  const gate = new Promise((r) => { release = r; });
  await page.goto(startUrl());
  // Hold every Firestore request until released.
  await page.route(FIRESTORE_ROUTE, async (route) => { await gate; await route.continue(); });

  await fillForm(page, { email, language: "en" });
  await page.locator("#join-free-button").click();
  await expect(page.locator("#join-free-button")).toHaveText(/Joining/);
  await page.waitForTimeout(3000);
  await expect(page.locator("#community-success")).toBeHidden();
  await expect(page.locator("#community-form")).toBeVisible();

  release();
  await expect(page.locator("#community-success")).toBeVisible({ timeout: 20_000 });
  expect(await signupsFor(email)).toHaveLength(1);
});

test("offline/failed write never shows success and keeps the form", async ({ page }) => {
  const email = uniqueEmail("offline");
  await page.goto(startUrl());
  await page.route(FIRESTORE_ROUTE, (route) => route.abort("internetdisconnected"));

  await fillForm(page, { firstName: "Offline", email, language: "en" });
  await page.locator("#join-free-button").click();
  const error = page.locator("#submit-error");
  await expect(error).toBeVisible({ timeout: 25_000 }); // 15 s save timeout
  await expect(error).toContainText("couldn’t complete your registration");
  await expect(page.locator("#community-success")).toBeHidden();
  await expect(page.locator("#community-form")).toBeVisible();
  await expect(page.locator('input[name="email"]')).toHaveValue(email);
  await expect(page.locator("#join-free-button")).toHaveText(/Try again/);
  await expect(page.locator("#join-free-button")).toBeEnabled();
});

test("if the Firebase library cannot load, the form reports an error instead of posting", async ({ page }) => {
  await page.route(/www\.gstatic\.com\/firebasejs\//, (route) => route.abort());
  await page.goto(startUrl());
  await fillForm(page, { email: uniqueEmail("nosdk"), language: "en" });
  await page.locator("#join-free-button").click();
  await expect(page.locator("#submit-error")).toContainText("registration isn’t available right now");
  await expect(page.locator("#community-success")).toBeHidden();
  expect(new URL(page.url()).pathname).toBe("/start");
});

for (const width of [1440, 390, 320]) {
  test(`layout at ${width}px: no horizontal scrolling, form and confirmation`, async ({ page }) => {
    await page.setViewportSize({ width, height: width >= 1000 ? 900 : 844 });
    await page.goto(startUrl());
    await page.locator("#community").scrollIntoViewIfNeeded();
    expect(await noHorizontalScroll(page)).toBe(true);
    if (SHOTS) await page.locator("#community").screenshot({ path: path.join(SHOTS, `form-${width}.png`) });

    // A deliberately long address must wrap, not widen the page.
    const email = `a.very.long.address.for.layout.${Date.now()}@example-long-domain.test`;
    await fillForm(page, { firstName: "Selam", email, language: "ti" });
    await page.locator("#join-free-button").click();
    await expect(page.locator("#community-success")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(600); // smooth scroll
    expect(await noHorizontalScroll(page)).toBe(true);
    const box = await page.locator("#success-email").boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    if (SHOTS) await page.locator("#community").screenshot({ path: path.join(SHOTS, `success-${width}.png`) });
  });
}

test("keyboard: tab order, visible focus, and submit from the keyboard", async ({ page }) => {
  await page.goto(startUrl());
  const first = page.locator('#community-form input[name="firstName"]');
  await first.focus();
  await page.keyboard.type("Keyboard");
  await page.keyboard.press("Tab");
  await expect(page.locator('#community-form input[name="email"]')).toBeFocused();
  await page.keyboard.type(uniqueEmail("kbd"));
  await page.keyboard.press("Tab");
  const focusedName = await page.evaluate(() => document.activeElement.name);
  expect(focusedName).toBe("preferredEmailLanguage");

  // Focus must be visible on the focused radio's label (outline or ring).
  const ringed = await page.evaluate(() => {
    const el = document.activeElement;
    const targets = [el, el.closest("label")];
    return targets.some((t) => {
      if (!t) return false;
      const s = getComputedStyle(t);
      return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
    });
  });
  expect(ringed).toBe(true);

  await page.keyboard.press("ArrowRight"); // radio group: arrow keys choose
  await page.keyboard.press("Space");
  const chosen = await page.evaluate(() => document.querySelector('input[name="preferredEmailLanguage"]:checked')?.value);
  expect(["ti", "am", "en"]).toContain(chosen);

  await page.keyboard.press("Tab");
  await expect(page.locator("#join-free-button")).toBeFocused();
  const buttonRing = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement);
    return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
  });
  expect(buttonRing).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.locator("#community-success")).toBeVisible({ timeout: 20_000 });
});

// ---- The emulator hook must stay inert everywhere except localhost ----

for (const host of ["www.geezword.com", "geezword-git-preview-ydroberts.vercel.app"]) {
  test(`emulator hook is inert on ${host}`, async ({ page }) => {
    // Serve the local files under that hostname (nothing is fetched from it).
    await page.route(new RegExp(`^https://${host.replace(/\./g, "\\.")}/`), async (route) => {
      const file = resolveFile(new URL(route.request().url()).pathname);
      if (!file) return route.fulfill({ status: 404, body: "Not found" });
      return route.fulfill({
        status: 200,
        contentType: TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        body: fs.readFileSync(file),
      });
    });
    const seen = await watchFirestore(page);
    await page.goto(`https://${host}/start?firestoreEmulator=${EMULATOR_PORT}#community`);
    await fillForm(page, { email: uniqueEmail("host"), language: "en" });
    await page.locator("#join-free-button").click();
    await expect.poll(() => seen.google.length, { timeout: 15_000 }).toBeGreaterThan(0);

    expect(seen.emulator).toHaveLength(0); // never the emulator
    // It targets the real project (request aborted, so nothing was sent).
    expect(seen.google.some((u) => decodeURIComponent(u).includes("projects/geezword-com/"))).toBe(true);
    expect(seen.google.some((u) => decodeURIComponent(u).includes("demo-geezword-test"))).toBe(false);
    await expect(page.locator("#community-success")).toBeHidden();
  });
}

for (const bad of ["abc", "0", "99999", `${EMULATOR_PORT}x`, `-${EMULATOR_PORT}`]) {
  test(`emulator hook ignores an invalid port on localhost (firestoreEmulator=${bad})`, async ({ page }) => {
    const seen = await watchFirestore(page);
    await page.goto(`${BASE}/start?firestoreEmulator=${encodeURIComponent(bad)}#community`);
    await fillForm(page, { email: uniqueEmail("badport"), language: "en" });
    await page.locator("#join-free-button").click();
    await expect.poll(() => seen.google.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(seen.emulator).toHaveLength(0);
    await expect(page.locator("#community-success")).toBeHidden();
  });
}

// ---- Sticky navigation must not cover the form heading or the confirmation ----

for (const [w, h] of [[320, 568], [320, 844], [390, 844], [1440, 900]]) {
  test(`#community at ${w}x${h}: "Register Free" is below the sticky navigation`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(startUrl());
    await scrollSettled(page);
    const heading = await page.locator("#community h2").boundingBox();
    expect(heading.y).toBeGreaterThanOrEqual(await navBottom(page));
    expect(heading.y + heading.height).toBeLessThanOrEqual(h);
  });

  test(`confirmation at ${w}x${h}: check mark and heading clear of the navigation`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(startUrl());
    await fillForm(page, { firstName: "Selam", email: uniqueEmail(`nav${w}x${h}`), language: "ti" });
    await page.locator("#join-free-button").click();
    await expect(page.locator("#community-success")).toBeVisible({ timeout: 20_000 });
    await scrollSettled(page);

    const nav = await navBottom(page);
    const mark = await page.locator(".success-mark").boundingBox();
    const heading = await page.locator("#community-success h3").boundingBox();
    expect(mark.y).toBeGreaterThanOrEqual(nav);
    expect(heading.y).toBeGreaterThanOrEqual(nav);
    expect(heading.y + heading.height).toBeLessThanOrEqual(h);
    expect(await noHorizontalScroll(page)).toBe(true);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `viewport-success-${w}x${h}.png`) });
  });
}

test("heading order in the registration section", async ({ page }) => {
  await page.goto(startUrl());
  const levels = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#community h1, #community h2, #community h3, #community h4, #community h5, #community h6"))
      .map((h) => Number(h.tagName[1]))
  );
  expect(levels).toEqual([2, 3]); // "Register Free" (h2), then the success "Welcome" (h3)
  await expect(page.locator("#community h2")).toHaveText("Register Free");
});
