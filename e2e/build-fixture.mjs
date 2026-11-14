// Bundles three fixtures with the vite and the tailwind that the core
// checkout's frontend/ installs:
//   fixture/bundle.js   the addon's map module alone (entry.ts)
//   fixture/page.js     the real page, with a stand-in router, drive and file
//                       grid (page/entry.tsx), and fixture/page.css, the
//                       core's stylesheet compiled over the addon's sources.
//   fixture/shelf.js    the real shelf over the core's own justified grid
//                       (shelf/entry.tsx), which the stand-in grid cannot
//                       stand in for.
// The page's stylesheet needs the link tree that ./setup-addons.sh makes,
// which is where tailwind finds the addon's classes.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const addonRoot = resolve(here, "..");
const coreFrontend = resolve(here, "../../../frontend");

// The addon's files sit outside frontend/, so a package they import is looked
// for beside them and not found: it is resolved from the core's frontend/.
const corePackages = {
  name: "core-packages",
  enforce: "pre",
  async resolveId(source, importer, options) {
    if (!importer || !importer.startsWith(addonRoot) || !/^[a-z@]/.test(source) || source.startsWith("@/")) return null;
    return this.resolve(source, join(coreFrontend, "package.json"), { ...options, skipSelf: true });
  },
};

export default async function buildFixture() {
  const require = createRequire(join(coreFrontend, "package.json"));
  const { build } = require("vite");
  const alias = [
    { find: /^next\/navigation$/, replacement: join(here, "fixture/page/navigation.ts") },
    { find: /^next\/link$/, replacement: join(here, "fixture/page/link.tsx") },
    { find: /^@\/components\/CurrentDriveProvider$/, replacement: join(here, "fixture/page/drive.ts") },
    { find: /^@\/components\/FileGrid$/, replacement: join(here, "fixture/page/FileGrid.tsx") },
    { find: /^@\/components\/AddonSlotsProvider$/, replacement: join(here, "fixture/page/addonSlots.ts") },
    { find: "@", replacement: join(coreFrontend, "src") },
  ];
  // The shelf fixture measures the grid's own line, so it keeps the core's
  // grid; an earlier entry wins over the stand-in above. The grid's context
  // menu renders an addon slot, which would load every installed addon.
  const realFileGrid = {
    find: /^@\/components\/FileGrid$/,
    replacement: join(coreFrontend, "src/components/FileGrid.tsx"),
  };
  const noAddonSlot = {
    find: /^@\/components\/AddonSlot$/,
    replacement: join(here, "fixture/page/addonSlot.tsx"),
  };
  const common = {
    root: here,
    configFile: false,
    logLevel: "warn",
    plugins: [corePackages],
    esbuild: { jsx: "automatic" },
    define: { "process.env.NODE_ENV": '"production"' },
  };
  const bundle = (entry, name, alias) =>
    build({
      ...common,
      resolve: { alias },
      build: {
        outDir: join(here, "fixture"),
        emptyOutDir: false,
        minify: false,
        rollupOptions: {
          // "use client" is the app's, and means nothing in a plain bundle.
          onwarn: (warning, warn) => {
            if (warning.code !== "MODULE_LEVEL_DIRECTIVE" && warning.code !== "SOURCEMAP_ERROR") warn(warning);
          },
        },
        lib: { entry: join(here, entry), formats: ["iife"], name, fileName: () => `${name}.js` },
      },
    });

  await bundle("fixture/entry.ts", "bundle", alias);
  await bundle("fixture/page/entry.tsx", "page", alias);
  await bundle("fixture/shelf/entry.tsx", "shelf", [realFileGrid, noAddonSlot, ...alias]);

  execFileSync(
    join(coreFrontend, "node_modules/.bin/tailwindcss"),
    ["--input", join(coreFrontend, "src/app/globals.css"), "--output", join(here, "fixture/page.css")],
    { stdio: "inherit" },
  );
}
