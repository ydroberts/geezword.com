/**
 * Geezword Cloud Functions
 * -------------------------
 * notifyOnCommunitySignup — fires whenever a new document is created in the
 * Firestore `community-signups` collection (populated by the signup form at
 * geezword.com/start#community). Sends a notification email to the owner via
 * Resend so new joins reach the inbox without manually opening the Console.
 *
 * Setup (one-time, done from the repo root):
 *   1. Upgrade the Firebase project to Blaze plan (Spark doesn't allow Cloud
 *      Functions). Free tier easily covers this use case — at $0.40 per
 *      million invocations after 2M free, the cost ceiling is unreachable.
 *   2. Sign up at resend.com (free tier: 100 emails/day, 3,000/month).
 *      Create an API key in Dashboard → API Keys.
 *   3. Install the Firebase CLI:  npm install -g firebase-tools
 *   4. firebase login              (browser auth)
 *   5. Store the Resend key as a Secret Manager secret (NOT in code):
 *        firebase functions:secrets:set RESEND_API_KEY
 *      (paste the key when prompted; CLI uploads to Google Secret Manager)
 *   6. Install function deps:      cd functions && npm install
 *   7. Deploy:                     firebase deploy --only functions
 *   8. Test: submit a real signup at geezword.com/start#community → inbox
 *
 * Local emulator testing (optional):
 *   Create functions/.env with RESEND_API_KEY=re_... then:
 *     npm run serve
 *   The emulator surfaces the function at the URL it prints; trigger by
 *   writing a doc to the Firestore emulator.
 *
 * Reading logs after deploy:
 *   firebase functions:log
 *   or  https://console.firebase.google.com/project/geezword-com/functions/logs
 */

const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const { Resend } = require("resend");
const { Webhook } = require("svix");
const admin = require("firebase-admin");
const crypto = require("crypto");

// Admin SDK — bypasses security rules. Used to (a) check new-vs-update on
// signup, and (b) maintain the canonical members/{emailHash} table.
admin.initializeApp();

// Canonical email normalisation — trim + lowercase — applied BEFORE hashing
// so "  Me@Ex.com " and "me@ex.com" map to the same member. Used for both
// the member document id and the stored `email` field.
function normalizeEmail(raw) {
  return (raw || "").toString().trim().toLowerCase();
}

// Stable, path-safe member id: sha256 of the normalized email (hex).
function memberIdFor(normalizedEmail) {
  return crypto.createHash("sha256").update(normalizedEmail).digest("hex");
}

// Preferred-email-language code → human label (formVersion 2+).
const LANG_LABELS = {
  ti: "Tigrinya (ትግርኛ)",
  am: "Amharic (አማርኛ)",
  en: "English",
};

// Interest slug → human label (formVersion 2+). Unknown/legacy values
// (e.g. v1's "Learn"/"Play") fall through to the raw value.
const INTEREST_LABELS = {
  tigrinya: "Tigrinya learning",
  amharic: "Amharic learning",
  "geez-kidase": "Geez and Kidase",
  "childrens-learning": "Children's learning",
  "books-courses": "Books and courses",
  games: "Games",
  "keyboards-typing": "Keyboards and typing",
  general: "General news and announcements",
};

// Secrets pulled from Google Secret Manager at runtime — never in repo.
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");
// Svix signing secret for the Resend webhook endpoint. Set during dashboard
// setup: firebase functions:secrets:set RESEND_WEBHOOK_SECRET
const RESEND_WEBHOOK_SECRET = defineSecret("RESEND_WEBHOOK_SECRET");

// Resend Audience for the Geezword community (non-secret id). Created 2026-08-10.
const RESEND_AUDIENCE_ID = "4edf1584-2df3-4a33-ad54-a9052169f9c8";

// Interest slug → Resend Topic id (created 2026-08-10, default_subscription
// opt_out). A member is opted IN to the topics matching their interests[].
// Legacy v1 interest values (Learn/Read/Type) intentionally have no mapping,
// so legacy members carry no topics until they re-register.
const TOPIC_IDS = {
  general:              "c975d6a1-bba0-456c-acfd-661630d2aa91",
  tigrinya:             "9595a360-7e54-4460-a0d1-b3657bd6e0f4",
  amharic:              "d00dd082-6e5e-4fbe-81cc-0745b72ecee9",
  "childrens-learning": "4734d734-307d-46a3-bd87-c91e11664719",
  "geez-kidase":        "4aa6f9f3-12ed-4b20-95b6-ac1a72c5267b",
  "books-courses":      "f920859b-987a-48b2-8626-54e0f999671f",
  games:                "7037886c-02b8-4c6c-b953-dc5ff3c59e0d",
  "keyboards-typing":   "ea39c978-4cb6-41f2-8b10-f4ebac7c22e6",
};

// Who gets the notification email. Hardcoded since it's the owner address.
const NOTIFY_TO = "ydroberts@gmail.com";

// Sender. geezword.com domain verified in Resend 2026-06-06 with DKIM +
// SPF DNS records at SiteGround. To change the local-part (hello@),
// update below — no DNS change needed since any *@geezword.com works.
const FROM_EMAIL = "Geezword <hello@geezword.com>";

exports.notifyOnCommunitySignup = onDocumentCreated(
  {
    document: "community-signups/{docId}",
    region: "us-central1",
    secrets: [RESEND_API_KEY],
    memory: "256MiB",
    timeoutSeconds: 30,
    // Auto-retry on transient failures (e.g., Resend rate-limit, network blip).
    // Doc-create events are idempotent on the Firestore side, so worst case
    // is the same email is sent twice — acceptable for a low-volume hook.
    retry: true,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.warn("notifyOnCommunitySignup fired without snapshot — skipping");
      return;
    }

    const data = snap.data() || {};
    const firstName = (data.firstName || "(no name)").toString();
    const email     = (data.email || "(no email)").toString();

    // Preferred email language (formVersion 2+). Older records won't have it.
    const langCode = (data.preferredEmailLanguage || "").toString();
    const language = LANG_LABELS[langCode] || (langCode || "(not specified)");

    // Interests, mapped to human labels where known.
    const interestsArr = Array.isArray(data.interests) ? data.interests : [];
    const interests = interestsArr.length
      ? interestsArr.map((i) => INTEREST_LABELS[i] || i).join(", ")
      : "(none selected)";

    const source    = (data.source || "(unknown)").toString();

    // New registration vs. update: is this email already in the collection?
    // The just-created doc is included in the query, so size > 1 means a
    // prior submission exists for the same address.
    let registrationType = "New registration";
    const rawEmail = (data.email || "").toString();
    if (rawEmail) {
      try {
        const prior = await admin
          .firestore()
          .collection("community-signups")
          .where("email", "==", rawEmail)
          .get();
        if (prior.size > 1) {
          registrationType =
            `Update to existing registration (${prior.size} submissions for this email)`;
        }
      } catch (err) {
        logger.warn("Duplicate-check query failed; reporting as unknown", {
          error: err.message,
        });
        registrationType = "New or updated (duplicate check unavailable)";
      }
    }
    const createdAt = data.createdAt && typeof data.createdAt.toDate === "function"
      ? data.createdAt.toDate()
      : new Date();

    const createdAtIso  = createdAt.toISOString();
    const createdAtUser = createdAt.toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const isUpdate = registrationType.startsWith("Update");
    const subject = `${isUpdate ? "Updated" : "New"} Geezword signup: ${firstName}`;

    // Plain-text fallback (deliverability boost + accessibility)
    const text =
      `${isUpdate ? "Updated" : "New"} Geezword community signup\n` +
      `------------------------------\n\n` +
      `Type:      ${registrationType}\n` +
      `Name:      ${firstName}\n` +
      `Email:     ${email}\n` +
      `Language:  ${language}\n` +
      `Interests: ${interests}\n` +
      `Source:    ${source}\n` +
      `Signed up: ${createdAtUser} (${createdAtIso})\n\n` +
      `View all signups in the Firebase Console:\n` +
      `https://console.firebase.google.com/project/geezword-com/firestore/databases/-default-/data/~2Fcommunity-signups\n`;

    // DESIGN.md-flavored HTML (parchment / indigo / saffron)
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#F4ECD8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 20px rgba(15,24,56,0.08);border:1px solid rgba(168,121,24,0.18);">
    <div style="background:linear-gradient(135deg,#1F2A5C 0%,#0F1838 100%);padding:24px 28px;color:#F0D88A;">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#D4A027;font-weight:700;margin-bottom:6px;">${isUpdate ? "Updated Signup" : "New Signup"}</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#F0D88A;letter-spacing:-0.3px;">${esc(firstName)} ${isUpdate ? "updated their Geezword registration." : "just joined Geezword."}</h1>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:15px;color:#1A1614;">
      ${row("Type", esc(registrationType))}
      ${row("Name", esc(firstName))}
      ${row("Email", `<a href="mailto:${esc(email)}" style="color:#1F2A5C;text-decoration:none;font-weight:600;">${esc(email)}</a>`)}
      ${row("Language", esc(language))}
      ${row("Interests", esc(interests))}
      ${row("Source", esc(source))}
      ${row("Signed up", esc(createdAtUser))}
    </table>
    <div style="padding:18px 28px 24px;border-top:1px solid #eee;color:#888;font-size:12px;line-height:1.5;">
      Sent by your Firebase Cloud Function (<code>notifyOnCommunitySignup</code>).<br>
      <a href="https://console.firebase.google.com/project/geezword-com/firestore/databases/-default-/data/~2Fcommunity-signups" style="color:#A87918;text-decoration:none;font-weight:600;">View all signups in Firestore &rarr;</a>
    </div>
  </div>
</body>
</html>`;

    const resend = new Resend(RESEND_API_KEY.value());

    try {
      const result = await resend.emails.send({
        from: FROM_EMAIL,
        to: NOTIFY_TO,
        subject,
        html,
        text,
      });
      if (result.error) {
        logger.error("Resend returned error", result.error);
        throw new Error(`Resend error: ${result.error.message || result.error}`);
      }
      logger.info("Notification sent", {
        signupId: event.params.docId,
        resendId: result.data && result.data.id,
        // No PII in logs — identify the member by the same stable hash used
        // as the members/{id} document id.
        memberId: rawEmail ? memberIdFor(normalizeEmail(rawEmail)) : null,
      });
    } catch (err) {
      logger.error("Failed to send notification email", {
        signupId: event.params.docId,
        error: err.message,
      });
      throw err; // let the platform retry per `retry: true`
    }
  }
);

/**
 * syncMemberOnSignup — maintains the canonical members/{emailHash} table.
 *
 * Fires on every new community-signups doc and upserts one member record per
 * (normalized) email. Runs independently of notifyOnCommunitySignup.
 *
 * Guarantees (per product requirements):
 *  - Email is trimmed + lowercased BEFORE hashing → one member per person.
 *  - LATEST preferred language + interests + firstName win on each signup.
 *  - An `unsubscribed` member is NEVER silently re-subscribed: on update we
 *    do not write `status`, so a prior opt-out is preserved. (Phase 2 keeps
 *    this in two-way sync with Resend so opt-outs can't be emailed.)
 *  - `firstSeenAt` is written once (on member creation) and never overwritten.
 *
 * The members collection is server-only (see firestore.rules) — this function
 * uses the Admin SDK, which bypasses rules.
 */
exports.syncMemberOnSignup = onDocumentCreated(
  {
    document: "community-signups/{docId}",
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    retry: true,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.warn("syncMemberOnSignup fired without snapshot — skipping");
      return;
    }
    const data = snap.data() || {};

    const email = normalizeEmail(data.email);
    if (!email) {
      logger.warn("syncMemberOnSignup: signup has no email — skipping", {
        signupId: event.params.docId,
      });
      return;
    }

    const memberId = memberIdFor(email);
    const ref = admin.firestore().collection("members").doc(memberId);
    const FieldValue = admin.firestore.FieldValue;
    const serverNow = FieldValue.serverTimestamp();

    // Latest-wins fields written on both create and update.
    const latest = {
      email,
      firstName: (data.firstName || "").toString(),
      interests: Array.isArray(data.interests) ? data.interests : [],
      source: (data.source || "").toString(),
      updatedAt: serverNow,
      lastSignupAt: data.createdAt || serverNow,
    };
    // Only overwrite language/formVersion when THIS signup carries them, so a
    // later v1-style submission can't erase a previously chosen language.
    if (data.preferredEmailLanguage) {
      latest.preferredEmailLanguage = data.preferredEmailLanguage;
    }
    if (data.formVersion !== undefined && data.formVersion !== null) {
      latest.formVersion = data.formVersion;
    }

    try {
      await admin.firestore().runTransaction(async (tx) => {
        const existing = await tx.get(ref);
        if (!existing.exists) {
          // New member — set defaults that must never be clobbered later.
          tx.set(ref, {
            ...latest,
            status: "subscribed",
            firstSeenAt: data.createdAt || serverNow,
            signupCount: 1,
          });
        } else {
          // Existing member — merge latest prefs but DO NOT touch `status`
          // (preserves any unsubscribe) or `firstSeenAt`.
          tx.set(
            ref,
            { ...latest, signupCount: FieldValue.increment(1) },
            { merge: true }
          );
        }
      });
      logger.info("Member synced", {
        signupId: event.params.docId,
        memberId, // hash only — no raw email/name in logs
      });
    } catch (err) {
      logger.error("syncMemberOnSignup failed", {
        signupId: event.params.docId,
        error: err.message,
      });
      throw err; // retry per `retry: true`
    }
  }
);

/**
 * syncMemberToResend — pushes the canonical member's profile + subscription
 * state into the Resend Audience as a Contact. Triggered on members/{id}
 * writes. Sending emails is NOT done here — this only syncs contact data.
 *
 * Loop prevention: we mirror the last-synced state on the member document
 *  - resendUnsubscribed  : last unsubscribed value pushed to Resend
 *  - resendProfileHash   : hash of {first_name, language, sorted topics}
 * and skip the Resend API call when nothing changed. The webhook writes these
 * mirrors too, so an inbound unsubscribe never bounces back out and loops.
 *
 * Unsubscribe authority: `unsubscribed` sent to Resend is derived from
 * members.status; an unsubscribed member is always pushed as unsubscribed:true
 * and is never re-subscribed by a profile/interest change.
 */
exports.syncMemberToResend = onDocumentWritten(
  {
    document: "members/{memberId}",
    region: "us-central1",
    secrets: [RESEND_API_KEY],
    memory: "256MiB",
    timeoutSeconds: 30,
    retry: true,
  },
  async (event) => {
    const after = event.data && event.data.after;
    if (!after || !after.exists) return; // deletion — nothing to sync
    const m = after.data() || {};
    const memberId = event.params.memberId;

    const email = normalizeEmail(m.email);
    if (!email) return;

    const unsubscribed = m.status === "unsubscribed";
    const language = m.preferredEmailLanguage || null; // omit when unknown
    const interests = Array.isArray(m.interests) ? m.interests : [];
    const topicIds = interests.map((s) => TOPIC_IDS[s]).filter(Boolean).sort();

    // Profile hash EXCLUDES unsubscribe (tracked separately) so an unsubscribe
    // toggle doesn't force a redundant profile push.
    const profileHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ f: m.firstName || "", l: language, t: topicIds }))
      .digest("hex");

    const needsProfile = m.resendProfileHash !== profileHash;
    const needsUnsub = m.resendUnsubscribed !== unsubscribed;
    if (!needsProfile && !needsUnsub) return; // already in sync — breaks loops

    // NOTE: we call the Resend REST API directly (not the SDK). The v4 SDK
    // silently drops first_name/properties/topics on contacts; REST does not.
    // Custom properties `language` and `member_id` are pre-defined at the
    // account level (POST /contact-properties) — required or REST returns 422.
    const properties = { member_id: memberId };
    if (language) properties.language = language; // no language => excluded from lang segments
    const payload = {
      email,
      first_name: (m.firstName || "").toString(),
      unsubscribed,
      properties,
      topics: topicIds, // opt-in to matching interest topics
    };

    const apiBase = `https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`;
    const apiHeaders = {
      Authorization: `Bearer ${RESEND_API_KEY.value()}`,
      "Content-Type": "application/json",
    };
    const body = JSON.stringify(payload);

    try {
      let contactId = m.resendContactId || null;
      // Upsert: update by email; if the contact doesn't exist yet, create it.
      let resp = await fetch(`${apiBase}/${encodeURIComponent(email)}`, {
        method: "PATCH",
        headers: apiHeaders,
        body,
      });
      if (resp.status === 404) {
        resp = await fetch(apiBase, { method: "POST", headers: apiHeaders, body });
      }
      if (!resp.ok) {
        const detail = (await resp.text()).slice(0, 200);
        throw new Error(`Resend upsert HTTP ${resp.status}: ${detail}`);
      }
      const j = await resp.json().catch(() => ({}));
      if (j && j.id) contactId = j.id;

      await after.ref.set(
        {
          resendUnsubscribed: unsubscribed,
          resendProfileHash: profileHash,
          resendContactId: contactId || null,
          resendSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
          resendSyncError: null,
        },
        { merge: true }
      );
      logger.info("Member → Resend synced", { memberId, unsubscribed });
    } catch (err) {
      await after.ref.set(
        { resendSyncError: (err.message || "sync error").slice(0, 300) },
        { merge: true }
      );
      logger.error("syncMemberToResend failed", { memberId, error: err.message });
      throw err; // retry per `retry: true`
    }
  }
);

/**
 * resendWebhook — receives Resend (Svix-signed) events and records
 * unsubscribes / complaints as authoritative in Firestore.
 *
 * Security: every request is Svix-signature-verified against
 * RESEND_WEBHOOK_SECRET using the RAW body; invalid/missing signatures are
 * rejected with 400. Duplicate deliveries are ignored via svix-id dedup.
 * No PII is logged (member hash + event type + svix-id only).
 *
 * Authority: an unsubscribe/complaint sets members.status = "unsubscribed"
 * and is never reversed by later syncs (mirrors are set so the outbound sync
 * treats Resend as already-unsubscribed).
 */
exports.resendWebhook = onRequest(
  {
    region: "us-central1",
    secrets: [RESEND_WEBHOOK_SECRET],
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (req, res) => {
    // 1. Verify Svix signature over the RAW body.
    let evt;
    try {
      const wh = new Webhook(RESEND_WEBHOOK_SECRET.value());
      const payload = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body);
      evt = wh.verify(payload, {
        "svix-id": req.header("svix-id"),
        "svix-timestamp": req.header("svix-timestamp"),
        "svix-signature": req.header("svix-signature"),
      });
    } catch (err) {
      logger.warn("resendWebhook: signature verification failed");
      res.status(400).send("invalid signature");
      return;
    }

    const svixId = req.header("svix-id");
    const type = evt && evt.type;
    const d = (evt && evt.data) || {};

    // 2. Determine whether this event is an unsubscribe/complaint and for whom.
    let reason = null;
    if (type === "contact.updated" && d.unsubscribed === true) reason = "user_unsubscribe";
    else if (type === "email.complained") reason = "complaint";
    else if (type === "suppression.added") reason = "suppression";

    // Extract the recipient email across event shapes.
    const rawEmail =
      d.email ||
      (Array.isArray(d.to) ? d.to[0] : d.to) ||
      (d.recipient && d.recipient.email) ||
      "";
    const email = normalizeEmail(rawEmail);

    if (!reason || !email) {
      // Not an unsubscribe we act on (or no email) — ack so Resend won't retry.
      res.status(200).send("ignored");
      return;
    }

    const memberId = memberIdFor(email);
    const db = admin.firestore();
    const dedupRef = db.collection("processed_webhooks").doc(svixId);
    const memberRef = db.collection("members").doc(memberId);
    const FieldValue = admin.firestore.FieldValue;
    const eventTime = evt && evt.created_at ? new Date(evt.created_at) : null;

    try {
      await db.runTransaction(async (tx) => {
        // Idempotency: skip if this svix-id was already handled.
        const seen = await tx.get(dedupRef);
        if (seen.exists) return;

        const memberSnap = await tx.get(memberRef);
        const alreadyUnsub =
          memberSnap.exists && memberSnap.data().status === "unsubscribed";

        if (!alreadyUnsub) {
          const patch = {
            email,
            status: "unsubscribed",
            unsubscribedAt: eventTime || FieldValue.serverTimestamp(),
            unsubscribeReason: reason,
            unsubscribeSource: "resend_webhook",
            // Mirror: Resend already has them unsubscribed → outbound sync no-op.
            resendUnsubscribed: true,
            updatedAt: FieldValue.serverTimestamp(),
          };
          if (!memberSnap.exists) {
            // Tombstone so a future signup can't silently re-subscribe them.
            patch.firstSeenAt = FieldValue.serverTimestamp();
            patch.source = "resend_webhook";
          }
          tx.set(memberRef, patch, { merge: true });
        }

        tx.set(dedupRef, {
          type,
          reason,
          receivedAt: FieldValue.serverTimestamp(),
        });
      });

      logger.info("Unsubscribe recorded", { memberId, type, svixId });
      res.status(200).send("ok");
    } catch (err) {
      logger.error("resendWebhook processing failed", { svixId, error: err.message });
      res.status(500).send("processing error"); // Svix will retry; dedup makes it safe
    }
  }
);

// --- helpers ---

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function row(label, value) {
  return `<tr>
    <td style="padding:14px 28px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;border-bottom:1px solid #f3eddc;width:130px;vertical-align:top;">${label}</td>
    <td style="padding:14px 28px 14px 0;border-bottom:1px solid #f3eddc;">${value}</td>
  </tr>`;
}
