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

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const { Resend } = require("resend");

// Secret pulled from Google Secret Manager at runtime — never in repo.
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

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
    const interests = Array.isArray(data.interests) && data.interests.length
      ? data.interests.join(", ")
      : "(none selected)";
    const source    = (data.source || "(unknown)").toString();
    const createdAt = data.createdAt && typeof data.createdAt.toDate === "function"
      ? data.createdAt.toDate()
      : new Date();

    const createdAtIso  = createdAt.toISOString();
    const createdAtUser = createdAt.toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    });

    const subject = `New Geezword signup: ${firstName}`;

    // Plain-text fallback (deliverability boost + accessibility)
    const text =
      `New Geezword community signup\n` +
      `------------------------------\n\n` +
      `Name:      ${firstName}\n` +
      `Email:     ${email}\n` +
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
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#D4A027;font-weight:700;margin-bottom:6px;">New Signup</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;color:#F0D88A;letter-spacing:-0.3px;">${esc(firstName)} just joined Geezword.</h1>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:15px;color:#1A1614;">
      ${row("Name", esc(firstName))}
      ${row("Email", `<a href="mailto:${esc(email)}" style="color:#1F2A5C;text-decoration:none;font-weight:600;">${esc(email)}</a>`)}
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
        firstName,
        email,
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
