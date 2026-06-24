import fs from "node:fs";

const required = [
  "VERSION",
  "MANDATORY",
  "RELEASE_URL",
  "FRONTEND_IMAGE",
  "BACKEND_IMAGE",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const metadata = {
  schemaVersion: 1,
  version: process.env.VERSION,
  mandatory: process.env.MANDATORY === "true",
  publishedAt: new Date().toISOString(),
  releaseUrl: process.env.RELEASE_URL,
  notes: process.env.RELEASE_NOTES || "",
  minimumLauncherVersion: process.env.MINIMUM_LAUNCHER_VERSION || "1.0.0",
  launcherSetupUrl:
    process.env.LAUNCHER_SETUP_URL ||
    `https://github.com/Spark-Pair/TexTradeOS-PRO-Backend/releases/download/v${process.env.VERSION}/TexTradeOS-PRO-Setup-${process.env.VERSION}.exe`,
  frontendImage: process.env.FRONTEND_IMAGE,
  backendImage: process.env.BACKEND_IMAGE,
  frontendCommit: process.env.FRONTEND_COMMIT || "",
  backendCommit: process.env.BACKEND_COMMIT || "",
};

fs.mkdirSync("artifacts/release", { recursive: true });
fs.writeFileSync("artifacts/release/update.json", `${JSON.stringify(metadata, null, 2)}\n`);
