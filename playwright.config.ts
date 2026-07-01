import { defineConfig, devices } from "@playwright/test";
// Ensure Node.js version is recent enough for Playwright
const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
if (Number.isNaN(nodeMajor) || nodeMajor < 18) {
  throw new Error(
    `Playwright requires Node.js 18 or higher. You are running Node.js ${process.versions.node}. Please update your version of Node.js.`,
  );
}
import * as dotenv from "dotenv";
import * as path from "path";
import { PHARMACY_SITES } from "./tests/fixtures/pharmacies";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const ciBaseURL = process.env.BASE_URL;
const isCI = !!process.env.CI;

const pharmacyProjects = PHARMACY_SITES.filter(
  (site) => !(isCI && site.ciSkip),
).map((site) => ({
  name: site.name,
  use: { ...devices["Desktop Chrome"], baseURL: site.baseURL },
}));

/**
 * Keep the named pharmacy projects visible even when BASE_URL is set.
 * Add a separate CI Override project for ad-hoc single-site runs.
 */
const projects = ciBaseURL
  ? [
      ...pharmacyProjects,
      {
        name: "CI Override",
        use: { ...devices["Desktop Chrome"], baseURL: ciBaseURL },
      },
    ]
  : pharmacyProjects;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 300_000, // 5 min — sign-up Confirm can take up to 60 s per attempt
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    trace: "on",
    screenshot: "only-on-failure",
    video: "on",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects,
});
