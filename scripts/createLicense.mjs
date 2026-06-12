import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const values = process.argv.slice(2);
const valueFor = (name) => {
  const index = values.indexOf(`--${name}`);
  return index >= 0 ? values[index + 1] : "";
};
const requestPath = path.resolve(valueFor("request"));
const customer = String(valueFor("customer") || "").trim();
if (!valueFor("request") || !customer) {
  throw new Error("Usage: npm run license:create -- --request <request.json> --customer <name>");
}

const keyPath = path.join(os.homedir(), ".textradeos-license-keys", "private.pem");
const request = JSON.parse(fs.readFileSync(requestPath, "utf8").replace(/^\uFEFF/, ""));
const payload = {
  schemaVersion: 1,
  licenseId: crypto.randomUUID(),
  customer,
  issuedAt: new Date().toISOString(),
  minimumMatches: 3,
  fingerprints: request.fingerprints,
};
const canonical = JSON.stringify({
  schemaVersion: payload.schemaVersion,
  licenseId: payload.licenseId,
  customer: payload.customer,
  issuedAt: payload.issuedAt,
  minimumMatches: payload.minimumMatches,
  fingerprints: Object.fromEntries(
    Object.entries(payload.fingerprints).sort(([left], [right]) => left.localeCompare(right))
  ),
});
const signature = crypto
  .sign("sha256", Buffer.from(canonical), fs.readFileSync(keyPath))
  .toString("base64");
const outputDir = path.join(os.homedir(), "TexTradeOS-Licenses");
fs.mkdirSync(outputDir, { recursive: true });
const safeCustomer = customer.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
const outputPath = path.join(outputDir, `${safeCustomer}-${payload.licenseId}.license.json`);
fs.writeFileSync(outputPath, `${JSON.stringify({ payload, signature }, null, 2)}\n`);
console.log(outputPath);
