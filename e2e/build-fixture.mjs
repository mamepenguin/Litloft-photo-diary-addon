// Bundles e2e/fixture/entry.ts, which pulls in the addon's map module, with
// the vite that the core checkout's frontend/ installs.
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const coreFrontend = resolve(here, "../../../frontend");

export default async function buildFixture() {
  const require = createRequire(join(coreFrontend, "package.json"));
  const { build } = require("vite");
  await build({
    root: here,
    configFile: false,
    logLevel: "warn",
    resolve: { alias: [{ find: "@", replacement: join(coreFrontend, "src") }] },
    build: {
      outDir: join(here, "fixture"),
      emptyOutDir: false,
      minify: false,
      lib: { entry: join(here, "fixture/entry.ts"), formats: ["iife"], name: "fixture", fileName: () => "bundle.js" },
    },
  });
}
