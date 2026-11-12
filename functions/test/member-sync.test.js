// Emulator tests for member preference protection.
//
// Run with:  cd functions && npm test
// (test/run-emulator-tests.js starts the Firestore + Functions emulators under
// a demo- project, fake secrets and a mock Resend server; see that file.)
//
// Covers syncMemberOnSignup, syncMemberToResend and resendWebhook end to end:
// a signup document is written to the emulator, the real triggers run, and
// the resulting member record and the requests "sent to Resend" are checked.
"use strict";

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const crypto = require("node:crypto");
const admin = require("firebase-admin");
const { Webhook } = require("svix");

const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-geezword-test";
const MOCK_PORT = Number(process.env.MOCK_RESEND_PORT || 5199);
const WEBHOOK_SECRET = process.env.TEST_WEBHOOK_SECRET;
const WEBHOOK_URL = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1/resendWebhook`;

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST is not set — run through `npm test` (emulators only).");
}
if (!PROJECT_ID.startsWith("demo-")) {
  throw new Error(`Refusing to run against non-demo project "${PROJECT_ID}".`);
}

admin.initializeApp({ projectId: PROJECT_ID });
const db = admin.firestore();
const { FieldValue } = require("firebase-admin/firestore");

// ---------------------------------------------------------------------------
// Mock Resend API: records every request and keeps a minimal contact store.
// ---------------------------------------------------------------------------
const requests = []; // { seq, method, path, body }
const contacts = new Map(); // email -> { id }
let seq = 0;

const mock = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
    const entry = { seq: ++seq, method: req.method, path: req.url, body };
    requests.push(entry);
    const send = (status, obj) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    const m = req.url.match(/^\/audiences\/[^/]+\/contacts(?:\/([^/?]+))?/);
    if (m) {
      const email = m[1] ? decodeURIComponent(m[1]) : body.email;
      if (req.method === "PATCH") {
        if (!contacts.has(email)) return send(404, { name: "not_found" });
        return send(200, { object: "contact", id: contacts.get(email).id });
      }
      if (req.method === "POST") {
        const id = "contact_" + crypto.randomUUID();
        contacts.set(email, { id });
        return send(201, { object: "contact", id });
      }
    }
    if (req.url.startsWith("/emails")) return send(200, { id: "email_" + crypto.randomUUID() });
    return send(404, { name: "unexpected_path", path: req.url });
  });
});

before(() => new Promise((resolve) => mock.listen(MOCK_PORT, "127.0.0.1", resolve)));
after(async () => {
  await new Promise((resolve) => mock.close(resolve));
  await admin.app().delete();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const memberIdFor = (email) =>
  crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
const uniqueEmail = (label) => `${label}.${Date.now()}.${crypto.randomInt(1e6)}@example.test`;

async function waitFor(fn, what, timeoutMs = 45000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last) return last;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

const memberRef = (email) => db.collection("members").doc(memberIdFor(email));
const readMember = async (email) => (await memberRef(email).get()).data();
const contactRequests = (email) =>
  requests.filter((r) => r.path.includes("/contacts") && r.body && r.body.email === email.toLowerCase());

// Wait until the member exists, has synced to Resend, has the expected signup
// count, and no further Resend traffic has appeared for ~1.5 s.
async function settled(email, { signupCount } = {}) {
  await waitFor(async () => {
    const m = await readMember(email);
    if (!m || !m.resendSyncedAt) return false;
    if (signupCount !== undefined && m.signupCount !== signupCount) return false;
    if (m.topicReoptIn) return false; // a pending re-opt is not yet consumed
    return true;
  }, `member ${email} synced`);
  let count = -1;
  await waitFor(async () => {
    const n = contactRequests(email).length;
    if (n === count) return true;
    count = n;
    await sleep(1500);
    return false;
  }, `Resend traffic for ${email} to stop`);
  return readMember(email);
}

async function signup(email, { formVersion, interests, firstName = "Test", language = "en" }) {
  await db.collection("community-signups").add({
    firstName,
    email,
    preferredEmailLanguage: language,
    interests,
    source: "start-page",
    formVersion,
    createdAt: FieldValue.serverTimestamp(),
  });
}

// Topics included in Resend requests for this email after request #afterSeq.
function topicsSentAfter(email, afterSeq) {
  const byId = {};
  for (const r of contactRequests(email)) {
    if (r.seq <= afterSeq || !Array.isArray(r.body.topics)) continue;
    for (const t of r.body.topics) byId[t.id] = t.subscription;
  }
  return byId;
}
const TOPIC = {
  general: "c975d6a1-bba0-456c-acfd-661630d2aa91",
  tigrinya: "9595a360-7e54-4460-a0d1-b3657bd6e0f4",
  amharic: "d00dd082-6e5e-4fbe-81cc-0745b72ecee9",
  "books-courses": "f920859b-987a-48b2-8626-54e0f999671f",
  games: "7037886c-02b8-4c6c-b953-dc5ff3c59e0d",
};
const sorted = (a) => [...(a || [])].sort();

// Seed a member that once declined `games` (the state the old overwrite
// behaviour produced). Written directly, as no current form can produce it.
async function seedDeclinedGames(email, { keepGamesInInterests }) {
  await signup(email, { formVersion: 4, interests: ["general", "games"] });
  await settled(email, { signupCount: 1 });
  await memberRef(email).set(
    {
      interests: keepGamesInInterests ? ["general", "games"] : ["general"],
      resendTopics: { general: "opt_in", games: "opt_out" },
    },
    { merge: true }
  );
  await sleep(2000); // let the resulting no-op sync run
  return settled(email, { signupCount: 1 });
}

async function postWebhook(event, { id = "msg_" + crypto.randomUUID(), secret = WEBHOOK_SECRET } = {}) {
  const payload = JSON.stringify(event);
  const ts = new Date();
  const signature = new Webhook(secret).sign(id, ts, payload);
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(Math.floor(ts.getTime() / 1000)),
      "svix-signature": signature,
    },
    body: payload,
  });
  return { status: res.status, text: await res.text(), id };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("new v3 member receives general", async () => {
  const email = uniqueEmail("new-v3");
  await signup(email, { formVersion: 3, interests: ["general"], language: "ti" });
  const m = await settled(email, { signupCount: 1 });

  assert.deepEqual(m.interests, ["general"]);
  assert.equal(m.status, "subscribed");
  assert.equal(m.formVersion, 3);
  assert.equal(m.preferredEmailLanguage, "ti");
  assert.ok(m.firstSeenAt, "firstSeenAt set");
  assert.deepEqual(m.resendTopics, { general: "opt_in" });
  assert.deepEqual(topicsSentAfter(email, 0), { [TOPIC.general]: "opt_in" });
  assert.ok(contactRequests(email).every((r) => r.body.unsubscribed === false));
});

test("existing v3 member keeps all interests and topic states", async () => {
  const email = uniqueEmail("existing-v3");
  await signup(email, { formVersion: 4, interests: ["tigrinya", "amharic", "games"] });
  await settled(email, { signupCount: 1 });
  await memberRef(email).set(
    { interests: ["tigrinya", "amharic"], resendTopics: { tigrinya: "opt_in", amharic: "opt_in", games: "opt_out" } },
    { merge: true }
  );
  await sleep(2000);
  const beforeV3 = await settled(email, { signupCount: 1 });
  const firstSeen = beforeV3.firstSeenAt.toMillis();
  const mark = seq;

  await signup(email, { formVersion: 3, interests: ["general"], firstName: "Renamed", language: "am" });
  const m = await settled(email, { signupCount: 2 });

  assert.deepEqual(sorted(m.interests), ["amharic", "tigrinya"], "interests untouched (general not added)");
  assert.deepEqual(m.resendTopics, { tigrinya: "opt_in", amharic: "opt_in", games: "opt_out" });
  assert.equal(m.firstName, "Renamed");
  assert.equal(m.preferredEmailLanguage, "am");
  assert.equal(m.firstSeenAt.toMillis(), firstSeen, "firstSeenAt preserved");
  assert.equal(m.topicReoptIn, undefined);
  assert.deepEqual(topicsSentAfter(email, mark), {}, "no topic changes sent to Resend");
});

test("cached v4 subset adds interests without removing existing ones", async () => {
  const email = uniqueEmail("v4-subset");
  await signup(email, { formVersion: 4, interests: ["general", "tigrinya", "amharic"] });
  await settled(email, { signupCount: 1 });
  const mark = seq;

  await signup(email, { formVersion: 4, interests: ["books-courses"] });
  const m = await settled(email, { signupCount: 2 });

  assert.deepEqual(sorted(m.interests), ["amharic", "books-courses", "general", "tigrinya"]);
  assert.deepEqual(m.resendTopics, {
    general: "opt_in", tigrinya: "opt_in", amharic: "opt_in", "books-courses": "opt_in",
  });
  assert.deepEqual(topicsSentAfter(email, mark), { [TOPIC["books-courses"]]: "opt_in" },
    "only the new topic is sent; nothing is opted out");
});

test("declined topic is not re-enabled by an unrelated v4 or v3 signup", async () => {
  const email = uniqueEmail("declined");
  await seedDeclinedGames(email, { keepGamesInInterests: true });
  const mark = seq;

  await signup(email, { formVersion: 4, interests: ["tigrinya"] });
  let m = await settled(email, { signupCount: 2 });
  assert.deepEqual(sorted(m.interests), ["games", "general", "tigrinya"]);
  assert.equal(m.resendTopics.games, "opt_out", "games stays declined");
  assert.equal(m.resendTopics.general, "opt_in");
  assert.equal(m.resendTopics.tigrinya, "opt_in");

  await signup(email, { formVersion: 3, interests: ["general"] });
  m = await settled(email, { signupCount: 3 });
  assert.equal(m.resendTopics.games, "opt_out", "games stays declined after v3");

  assert.deepEqual(topicsSentAfter(email, mark), { [TOPIC.tigrinya]: "opt_in" },
    "games never sent as opt_in; general never sent as opt_out");
});

test("explicit re-selection of a declined topic re-opts in once", async () => {
  const email = uniqueEmail("reopt");
  await seedDeclinedGames(email, { keepGamesInInterests: false });
  const mark = seq;

  await signup(email, { formVersion: 4, interests: ["games"] });
  const m = await settled(email, { signupCount: 2 });

  assert.deepEqual(sorted(m.interests), ["games", "general"]);
  assert.equal(m.resendTopics.games, "opt_in");
  assert.equal(m.resendTopics.general, "opt_in", "general kept (additive)");
  assert.equal(m.topicReoptIn, undefined, "one-time re-opt consumed");
  assert.deepEqual(topicsSentAfter(email, mark), { [TOPIC.games]: "opt_in" });
});

test("unsubscribed member stays unsubscribed after v3 and v4 signups", async () => {
  const email = uniqueEmail("unsub");
  await signup(email, { formVersion: 4, interests: ["general", "amharic"] });
  await settled(email, { signupCount: 1 });

  const hook = await postWebhook({
    type: "contact.updated",
    created_at: new Date().toISOString(),
    data: { email, unsubscribed: true },
  });
  assert.equal(hook.status, 200, hook.text);
  let m = await readMember(email);
  assert.equal(m.status, "unsubscribed");
  assert.equal(m.unsubscribeReason, "user_unsubscribe");
  const mark = seq;

  await signup(email, { formVersion: 3, interests: ["general"] });
  await settled(email, { signupCount: 2 });
  await signup(email, { formVersion: 4, interests: ["games"] });
  m = await settled(email, { signupCount: 3 });

  assert.equal(m.status, "unsubscribed");
  const later = contactRequests(email).filter((r) => r.seq > mark);
  assert.ok(later.every((r) => r.body.unsubscribed === true),
    "every later Resend update keeps unsubscribed: true");
});

test("complained member stays unsubscribed after a later signup", async () => {
  const email = uniqueEmail("complaint");
  await signup(email, { formVersion: 3, interests: ["general"] });
  await settled(email, { signupCount: 1 });

  const hook = await postWebhook({
    type: "email.complained",
    created_at: new Date().toISOString(),
    data: { to: [email] },
  });
  assert.equal(hook.status, 200, hook.text);
  let m = await readMember(email);
  assert.equal(m.status, "unsubscribed");
  assert.equal(m.unsubscribeReason, "complaint");
  const mark = seq;

  await signup(email, { formVersion: 4, interests: ["general", "tigrinya"] });
  m = await settled(email, { signupCount: 2 });
  assert.equal(m.status, "unsubscribed");
  assert.ok(contactRequests(email).filter((r) => r.seq > mark).every((r) => r.body.unsubscribed === true));
});

test("complaint before registration leaves a tombstone a signup cannot reverse", async () => {
  const email = uniqueEmail("tombstone");
  const hook = await postWebhook({
    type: "email.complained",
    created_at: new Date().toISOString(),
    data: { to: [email] },
  });
  assert.equal(hook.status, 200, hook.text);
  let m = await readMember(email);
  assert.equal(m.status, "unsubscribed");
  assert.equal(m.source, "resend_webhook");

  await signup(email, { formVersion: 3, interests: ["general"] });
  await waitFor(async () => (await readMember(email)).signupCount === 1, "tombstone signup counted");
  await sleep(3000);
  m = await readMember(email);
  assert.equal(m.status, "unsubscribed");
  assert.ok(contactRequests(email).every((r) => r.body.unsubscribed === true));
});

test("duplicate webhook deliveries are idempotent; bad signatures are rejected", async () => {
  const email = uniqueEmail("dup");
  await signup(email, { formVersion: 3, interests: ["general"] });
  await settled(email, { signupCount: 1 });

  const event = { type: "contact.updated", created_at: "2026-11-11T12:00:00.000Z", data: { email, unsubscribed: true } };
  const id = "msg_dup_" + crypto.randomUUID();
  const first = await postWebhook(event, { id });
  assert.equal(first.status, 200, first.text);
  const m1 = await readMember(email);
  const ledger1 = await db.collection("processed_webhooks").doc(id).get();
  assert.ok(ledger1.exists);

  const second = await postWebhook(event, { id });
  assert.equal(second.status, 200, second.text);
  const m2 = await readMember(email);
  const ledger2 = await db.collection("processed_webhooks").doc(id).get();
  assert.equal(m2.status, "unsubscribed");
  assert.equal(m2.unsubscribedAt.toMillis(), m1.unsubscribedAt.toMillis(), "unsubscribedAt unchanged");
  assert.equal(ledger2.data().receivedAt.toMillis(), ledger1.data().receivedAt.toMillis(), "ledger written once");

  const forged = await postWebhook(
    { type: "contact.updated", data: { email: uniqueEmail("forged"), unsubscribed: true } },
    { secret: "whsec_" + Buffer.from("not-the-real-secret-000000000000").toString("base64") }
  );
  assert.equal(forged.status, 400);
});
