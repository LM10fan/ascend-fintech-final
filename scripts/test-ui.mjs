import { build } from "esbuild";
import { spawnSync } from "node:child_process";
await build({
  entryPoints: ["tests/ui.flow.jsx"],
  outfile: ".test-build/ui.flow.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  loader: { ".css": "empty" },
  logLevel: "warning",
});
const result = spawnSync(process.execPath, [".test-build/ui.flow.mjs"], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
