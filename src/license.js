import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import PUBLIC_KEY from "./config/licensePublicKey.js";

const licensePath = path.resolve(process.env.LICENSE_PATH || "./license/license.json");
const fingerprintPath = path.resolve(process.env.FINGERPRINT_PATH || "./license/fingerprint.json");

const canonicalFingerprints = (fingerprints = {}) =>
  Object.fromEntries(
    Object.entries(fingerprints)
      .map(([key, value]) => [String(key), String(value)])
      .sort(([left], [right]) => left.localeCompare(right))
  );

export const canonicalPayload = (payload = {}) =>
  JSON.stringify({
    schemaVersion: Number(payload.schemaVersion || 1),
    licenseId: String(payload.licenseId || ""),
    customer: String(payload.customer || ""),
    issuedAt: String(payload.issuedAt || ""),
    minimumMatches: Number(payload.minimumMatches || 3),
    fingerprints: canonicalFingerprints(payload.fingerprints),
  });

const readJson = (filePath) =>
  JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));

export const validateLicense = () => {
  let document;
  let runtimeFingerprint;
  try {
    document = readJson(licensePath);
  } catch {
    return { allowed: false, code: "LICENSE_MISSING", message: "Device license is missing" };
  }
  try {
    runtimeFingerprint = readJson(fingerprintPath);
  } catch {
    return { allowed: false, code: "FINGERPRINT_MISSING", message: "Device fingerprint is missing" };
  }

  const payload = document?.payload;
  const signature = String(document?.signature || "");
  if (!payload || !signature) {
    return { allowed: false, code: "LICENSE_INVALID", message: "Device license is invalid" };
  }

  const signatureValid = crypto.verify(
    "sha256",
    Buffer.from(canonicalPayload(payload)),
    PUBLIC_KEY,
    Buffer.from(signature, "base64")
  );
  if (!signatureValid) {
    return { allowed: false, code: "LICENSE_INVALID", message: "Device license signature is invalid" };
  }

  const expected = payload.fingerprints || {};
  const actual = runtimeFingerprint.fingerprints || {};
  const matches = Object.keys(expected).filter(
    (key) => expected[key] && actual[key] === expected[key]
  );
  const minimumMatches = Math.max(1, Number(payload.minimumMatches || 3));
  if (matches.length < minimumMatches) {
    return {
      allowed: false,
      code: "DEVICE_MISMATCH",
      message: "This license belongs to another server",
      licenseId: payload.licenseId,
      matches: matches.length,
      minimumMatches,
    };
  }

  return {
    allowed: true,
    code: "LICENSE_ACTIVE",
    licenseId: payload.licenseId,
    customer: payload.customer,
    issuedAt: payload.issuedAt,
    matches: matches.length,
    minimumMatches,
  };
};

export const requireLicense = (req, res, next) => {
  if (process.env.NODE_ENV !== "production" && process.env.LICENSE_ENFORCEMENT !== "true") {
    return next();
  }
  const result = validateLicense();
  if (!result.allowed) return res.status(403).json(result);
  req.license = result;
  return next();
};
