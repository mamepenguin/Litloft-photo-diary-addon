import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = 4173;

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.ts/,
  globalSetup: path.join(__dirname, "build-fixture.mjs"),
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices["Desktop Chrome"],
    // Software GL, so MapLibre gets a WebGL context in a headless run.
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: `node ${path.join(__dirname, "serve.mjs")} ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
  },
});
