import { build } from "esbuild";
import JavaScriptObfuscator from "javascript-obfuscator";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/server.js"],
  outfile: "dist/server.bundle.cjs",
  bundle: true,
  minify: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: false,
  external: ["better-sqlite3"],
  legalComments: "none",
});

const bundled = readFileSync("dist/server.bundle.cjs", "utf8");
const result = JavaScriptObfuscator.obfuscate(bundled, {
  compact: true,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.7,
});

writeFileSync("dist/server.cjs", result.getObfuscatedCode());
rmSync("dist/server.bundle.cjs", { force: true });
