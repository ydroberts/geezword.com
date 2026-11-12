// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.js/,
  workers: 1, // one shared emulator and static server
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    headless: true,
    reducedMotion: "reduce", // no smooth-scroll/animation while elements are clicked
  },
  outputDir: process.env.E2E_OUTPUT_DIR || require("path").join(__dirname, "test-results"),
});
