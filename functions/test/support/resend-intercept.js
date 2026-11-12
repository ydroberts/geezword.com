// Test-only preload (loaded with NODE_OPTIONS=--require by the emulator test
// runner, never by production). Redirects every request the functions make to
// https://api.resend.com to the local mock Resend server that the test process
// runs, so emulator tests can never reach the real Resend account.
//
// Both callers use the global fetch: syncMemberToResend calls the REST API
// directly, and the Resend SDK (notifyOnCommunitySignup) uses fetch too.
"use strict";

const MOCK_PORT = process.env.MOCK_RESEND_PORT;
const REAL_ORIGIN = "https://api.resend.com";

if (MOCK_PORT && typeof globalThis.fetch === "function" && !globalThis.__resendIntercepted) {
  const realFetch = globalThis.fetch;
  const mockOrigin = `http://127.0.0.1:${MOCK_PORT}`;
  globalThis.fetch = function interceptedFetch(input, init) {
    const url = typeof input === "string" ? input
      : input instanceof URL ? input.href
      : input && input.url;
    if (typeof url === "string" && url.startsWith(REAL_ORIGIN)) {
      const target = mockOrigin + url.slice(REAL_ORIGIN.length);
      if (typeof input === "string" || input instanceof URL) return realFetch(target, init);
      return realFetch(new Request(target, input), init);
    }
    return realFetch(input, init);
  };
  globalThis.__resendIntercepted = true;
}
