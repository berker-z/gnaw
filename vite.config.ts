import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// The Cloudflare plugin runs worker/index.ts inside workerd during `vite dev`
// (with a local D1 under .wrangler/state) and, on `vite build`, emits the
// client to dist/client and the Worker to dist/gnaw along with the config
// `wrangler deploy` picks up.
export default defineConfig({
  plugins: [cloudflare()],
});
