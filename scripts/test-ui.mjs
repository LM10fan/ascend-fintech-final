import { build } from "esbuild";
import { spawnSync } from "node:child_process";
for (const name of ["ui.flow", "credit.flow"]) {
  await build({
    entryPoints: [`tests/${name}.jsx`],
    outfile: `.test-build/${name}.mjs`,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    loader: { ".css": "empty" },
    logLevel: "warning",
  });
  const result = spawnSync(process.execPath, [`.test-build/${name}.mjs`], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
