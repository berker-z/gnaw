import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: "http://localhost:5173",
    launchOptions: {
      executablePath: process.env.CHROME_PATH,
      args: ["--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://localhost:5173",
    reuseExistingServer: true,
  },
  reporter: "list",
});
