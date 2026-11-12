#!/usr/bin/env node
// Runs the member-sync tests against the local Firebase emulators.
//
//   cd functions && npm test
//
// Safety:
//  - Uses a "demo-" project id, so the emulators never contact the real
//    geezword-com project or Google Secret Manager.
//  - Writes FAKE secrets to functions/.secret.local for the emulator only
//    (gitignored, and excluded from deploys by firebase.json "*.local"), and
//    deletes the file afterwards unless it already existed.
//  - Preloads test/support/resend-intercept.js so every Resend API call goes
//    to a local mock server instead of api.resend.com.
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FUNCTIONS_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(FUNCTIONS_DIR, "..");
const SECRET_FILE = path.join(FUNCTIONS_DIR, ".secret.local");
const PROJECT_ID = "demo-geezword-test";
const MOCK_RESEND_PORT = "5199";
// Svix secrets are "whsec_" + base64; this one is fake and test-only.
const WEBHOOK_SECRET = "whsec_" + Buffer.from("geezword-emulator-test-secret-0001").toString("base64");

const secretPreexisted = fs.existsSync(SECRET_FILE);
if (secretPreexisted) {
  console.error(`Refusing to overwrite existing ${SECRET_FILE}. Move it aside and re-run.`);
  process.exit(2);
}
fs.writeFileSync(
  SECRET_FILE,
  `RESEND_API_KEY=re_emulator_test_fake_key\nRESEND_WEBHOOK_SECRET=${WEBHOOK_SECRET}\n`
);

const intercept = path.join(__dirname, "support", "resend-intercept.js").replace(/\\/g, "/");
// Relative to the repo root, forward slashes, no spaces: safe to embed below.
const testFile = "functions/test/member-sync.test.js";
const env = {
  ...process.env,
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require "${intercept}"`.trim(),
  MOCK_RESEND_PORT,
  TEST_WEBHOOK_SECRET: WEBHOOK_SECRET,
  GCLOUD_PROJECT: PROJECT_ID,
};

let status = 1;
try {
  // One command string (shell: true is needed for firebase.cmd on Windows).
  const cmd =
    `firebase emulators:exec --project ${PROJECT_ID} --only functions,firestore ` +
    `"node --test --test-reporter=spec ${testFile}"`;
  const r = spawnSync(cmd, { cwd: REPO_ROOT, env, stdio: "inherit", shell: true });
  status = r.status === null ? 1 : r.status;
} finally {
  fs.rmSync(SECRET_FILE, { force: true });
}
process.exit(status);
