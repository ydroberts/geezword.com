#!/usr/bin/env node
// Runs the browser tests against the Firestore emulator.
//
//   cd tests/e2e && npm install && npm test
//
// Safety: the emulator runs under a "demo-" project id, so nothing can reach
// the real geezword-com project. The page only talks to the emulator because
// the tests open it on localhost with ?firestoreEmulator=<port> (a hook that
// is inert on any other host). No Cloud Functions run here, so nothing is
// sent to Resend. The Firebase web SDK itself is still loaded from
// www.gstatic.com, so the machine needs internet access.
"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PROJECT_ID = "demo-geezword-test";

const cmd =
  `firebase emulators:exec --project ${PROJECT_ID} --only firestore ` +
  `"npx --prefix tests/e2e playwright test --config tests/e2e/playwright.config.js"`;

const r = spawnSync(cmd, {
  cwd: REPO_ROOT,
  env: { ...process.env, GCLOUD_PROJECT: PROJECT_ID },
  stdio: "inherit",
  shell: true,
});
process.exit(r.status === null ? 1 : r.status);
