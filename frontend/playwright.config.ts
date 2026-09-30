import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";

process.env.E2E_CONTROL_TOKEN ??= randomUUID();

export default defineConfig({
    testDir: "./e2e",
    globalTeardown: "./e2e/teardown.ts",
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    timeout: 60000,
    expect: { timeout: 10000 },
    reporter: [["list"], ["html", { open: "never" }]],
    use: { baseURL: "http://127.0.0.1:3100", actionTimeout: 15000, trace: "retain-on-failure", screenshot: "only-on-failure" },
    projects: [
        { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    ],
    webServer: [
        { command: "node ../backend/scripts/e2e-server.mjs", url: "http://127.0.0.1:4100/health/ready", reuseExistingServer: false, timeout: 60000 },
        { command: "npm run dev -- --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: false, timeout: 120000,
            env: { NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:4100", JOBHAZEL_E2E: "1" } },
    ],
});
