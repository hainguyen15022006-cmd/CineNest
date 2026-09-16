import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const backendRequire = createRequire(resolve("backend/package.json"));
const dotenv = backendRequire("dotenv");

// Never reuse development servers or change booking times in the development DB.
const fileEnv = existsSync("backend/.env.test") ? dotenv.parse(readFileSync("backend/.env.test")) : {};
const databaseUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;
if (!databaseUrl || !/_(test|e2e)$/.test(new URL(databaseUrl).pathname.slice(1))) {
  throw new Error("E2E requires DATABASE_URL pointing to a database ending in _test or _e2e. Configure backend/.env.test first.");
}
process.env.DATABASE_URL = databaseUrl;
const serverEnv = {
  NODE_ENV: "test",
  DATABASE_URL: databaseUrl,
  SESSION_SECRET: process.env.SESSION_SECRET ?? fileEnv.SESSION_SECRET ?? "cinenest-e2e-session-secret",
  PORT: "3100",
  WEB_ORIGIN: "http://127.0.0.1:5175",
};

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5175",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev --workspace backend",
      env: serverEnv,
      url: "http://127.0.0.1:3100/api/health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run dev --workspace frontend -- --host 127.0.0.1 --port 5175 --strictPort",
      env: { API_ORIGIN: "http://127.0.0.1:3100" },
      url: "http://127.0.0.1:5175",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
