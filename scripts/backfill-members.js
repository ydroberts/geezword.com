/**
 * backfill-members.js — one-time migration.
 *
 * Collapses the append-only `community-signups` log into the canonical
 * `members/{sha256(normalizedEmail)}` table, mirroring syncMemberOnSignup's
 * rules but computed over full history:
 *   - email trimmed + lowercased before hashing
 *   - LATEST preferred language / interests / firstName win (by createdAt)
 *   - firstSeenAt = earliest signup, lastSignupAt = latest, signupCount = n
 *   - NEVER resurrects an unsubscribed member (preserves existing status)
 *
 * Auth: uses a Google OAuth access token (owner) via the Firestore REST API,
 * so it needs no service-account key. Run from the repo root:
 *
 *   # dry run (prints what it WOULD write, changes nothing):
 *   FIRESTORE_TOKEN="$(gcloud auth print-access-token)" node scripts/backfill-members.js
 *
 *   # commit:
 *   FIRESTORE_TOKEN="$(gcloud auth print-access-token)" node scripts/backfill-members.js --commit
 */

const crypto = require("crypto");

const PROJECT = "geezword-com";
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const TOKEN = process.env.FIRESTORE_TOKEN;
const COMMIT = process.argv.includes("--commit");

if (!TOKEN) {
  console.error('Missing FIRESTORE_TOKEN. Run: FIRESTORE_TOKEN="$(gcloud auth print-access-token)" node scripts/backfill-members.js');
  process.exit(1);
}

const authHeaders = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };

function normalizeEmail(raw) {
  return (raw || "").toString().trim().toLowerCase();
}
function memberIdFor(normalizedEmail) {
  return crypto.createHash("sha256").update(normalizedEmail).digest("hex");
}

// Firestore REST value helpers
function toStr(v) { return v && v.stringValue !== undefined ? v.stringValue : ""; }
function toArr(v) {
  const vals = v && v.arrayValue && v.arrayValue.values ? v.arrayValue.values : [];
  return vals.map((x) => x.stringValue).filter((s) => s !== undefined);
}

async function listAllSignups() {
  const docs = [];
  let pageToken = "";
  do {
    const url = `${BASE}/community-signups?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const res = await fetch(url, { headers: authHeaders });
    if (!res.ok) throw new Error(`list failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    (body.documents || []).forEach((d) => docs.push(d));
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return docs;
}

async function getMember(memberId) {
  const res = await fetch(`${BASE}/members/${memberId}`, { headers: authHeaders });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`get member failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function writeMember(memberId, fields, updateMask) {
  const maskParams = updateMask.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join("&");
  const url = `${BASE}/members/${memberId}?${maskParams}`;
  const res = await fetch(url, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(`patch member failed: ${res.status} ${await res.text()}`);
  return res.json();
}

(async () => {
  const signups = await listAllSignups();
  console.log(`Read ${signups.length} community-signups docs.`);

  // Group by normalized email
  const groups = new Map();
  for (const d of signups) {
    const f = d.fields || {};
    const email = normalizeEmail(toStr(f.email));
    if (!email) continue;
    const createdAt = (f.createdAt && f.createdAt.timestampValue) || d.createTime;
    const rec = {
      email,
      firstName: toStr(f.firstName),
      interests: toArr(f.interests),
      source: toStr(f.source),
      preferredEmailLanguage: toStr(f.preferredEmailLanguage) || null,
      formVersion: f.formVersion && f.formVersion.integerValue ? parseInt(f.formVersion.integerValue, 10) : null,
      createdAt,
    };
    if (!groups.has(email)) groups.set(email, []);
    groups.get(email).push(rec);
  }

  console.log(`→ ${groups.size} unique members.\n`);

  let created = 0, updated = 0;
  for (const [email, recs] of groups) {
    recs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const earliest = recs[0];
    const latest = recs[recs.length - 1];
    // latest language/interests: prefer the most recent record that HAS them
    const latestLang = [...recs].reverse().find((r) => r.preferredEmailLanguage)?.preferredEmailLanguage || null;
    const latestForm = [...recs].reverse().find((r) => r.formVersion != null)?.formVersion ?? null;

    const memberId = memberIdFor(email);
    const existing = await getMember(memberId);
    const existingStatus = existing && existing.fields && existing.fields.status
      ? existing.fields.status.stringValue : null;

    const fields = {
      email: { stringValue: email },
      firstName: { stringValue: latest.firstName },
      interests: { arrayValue: { values: latest.interests.map((s) => ({ stringValue: s })) } },
      source: { stringValue: latest.source },
      firstSeenAt: { timestampValue: new Date(earliest.createdAt).toISOString() },
      lastSignupAt: { timestampValue: new Date(latest.createdAt).toISOString() },
      updatedAt: { timestampValue: new Date().toISOString() },
      signupCount: { integerValue: String(recs.length) },
    };
    if (latestLang) fields.preferredEmailLanguage = { stringValue: latestLang };
    if (latestForm != null) fields.formVersion = { integerValue: String(latestForm) };

    const updateMask = Object.keys(fields);
    // Preserve status: only set to "subscribed" if the member doesn't already
    // have a status (i.e. brand new). Never overwrite an existing status.
    if (!existingStatus) {
      fields.status = { stringValue: "subscribed" };
      updateMask.push("status");
    }

    const label = existing ? "UPDATE" : "CREATE";
    console.log(`${label} ${email}  lang=${latestLang || "-"}  interests=[${latest.interests.join(",")}]  count=${recs.length}  status=${existingStatus || "subscribed"}`);

    if (COMMIT) {
      await writeMember(memberId, fields, updateMask);
      existing ? updated++ : created++;
    }
  }

  if (COMMIT) {
    console.log(`\nDONE. Created ${created}, updated ${updated}.`);
  } else {
    console.log(`\nDRY RUN — nothing written. Re-run with --commit to apply.`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
