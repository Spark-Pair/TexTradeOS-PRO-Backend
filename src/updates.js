import fs from "node:fs";
import path from "node:path";
import { IS_DEVELOPMENT } from "./environment.js";

const DEFAULT_UPDATE_URL =
  "https://github.com/Spark-Pair/TexTradeOS-PRO-Backend/releases/latest/download/update.json";
const dataDirectory = path.dirname(path.resolve(process.env.DATABASE_PATH || "./textradeos.sqlite"));
const statePath = path.join(dataDirectory, "update-state.json");
const requestPath = path.resolve(process.env.UPDATE_REQUEST_PATH || path.join(dataDirectory, "update-request.json"));

const parseVersion = (value) => {
  const match = String(value || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  return match ? match.slice(1).map(Number) : null;
};

export const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) throw new Error("Invalid release version");
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
};

const validateMetadata = (value) => {
  if (
    !value ||
    !parseVersion(value.version) ||
    typeof value.mandatory !== "boolean" ||
    typeof value.releaseUrl !== "string" ||
    typeof value.frontendImage !== "string" ||
    typeof value.backendImage !== "string"
  ) {
    throw new Error("Update metadata is invalid");
  }
  if (
    !value.releaseUrl.startsWith("https://github.com/Spark-Pair/") ||
    !value.frontendImage.startsWith("ghcr.io/spark-pair/textradeos-frontend@sha256:") ||
    !value.backendImage.startsWith("ghcr.io/spark-pair/textradeos-backend@sha256:")
  ) {
    throw new Error("Update metadata contains an untrusted location");
  }
  return {
    schemaVersion: Number(value.schemaVersion || 1),
    version: value.version,
    mandatory: value.mandatory,
    publishedAt: value.publishedAt || null,
    releaseUrl: value.releaseUrl,
    notes: String(value.notes || ""),
    minimumLauncherVersion: String(value.minimumLauncherVersion || "0.0.0"),
    frontendImage: value.frontendImage,
    backendImage: value.backendImage,
  };
};

const readCached = () => {
  try {
    return validateMetadata(JSON.parse(fs.readFileSync(statePath, "utf8")));
  } catch {
    return null;
  }
};

export const getPendingMandatoryUpdate = () => {
  if (IS_DEVELOPMENT) return null;
  const update = readCached();
  if (!update?.mandatory) return null;
  const currentVersion = process.env.APP_VERSION || "0.0.0";
  return compareVersions(update.version, currentVersion) > 0 ? update : null;
};

const writeCached = (metadata) => {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(metadata, null, 2)}\n`);
};

export const checkForUpdate = async () => {
  const currentVersion = process.env.APP_VERSION || "0.0.0";
  if (IS_DEVELOPMENT) {
    return {
      currentVersion,
      available: false,
      online: false,
      disabled: true,
      update: null,
    };
  }

  try {
    const response = await fetch(process.env.UPDATE_METADATA_URL || DEFAULT_UPDATE_URL, {
      headers: { Accept: "application/json", "User-Agent": `TexTradeOS/${currentVersion}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Update server returned HTTP ${response.status}`);
    const metadata = validateMetadata(await response.json());
    const available = compareVersions(metadata.version, currentVersion) > 0;
    if (available && metadata.mandatory) writeCached(metadata);
    else if (fs.existsSync(statePath)) fs.rmSync(statePath, { force: true });
    return { currentVersion, available, online: true, update: available ? metadata : null };
  } catch (error) {
    const cached = readCached();
    const available = cached ? compareVersions(cached.version, currentVersion) > 0 : false;
    return {
      currentVersion,
      available,
      online: false,
      checkError: error.message,
      update: available ? cached : null,
    };
  }
};

export const requestUpdate = async () => {
  if (IS_DEVELOPMENT) throw new Error("Updates are disabled in development");
  const status = await checkForUpdate();
  if (!status.available || !status.update) throw new Error("No newer update is available");
  if (!status.online) throw new Error("Connect the server to the internet before updating");
  fs.mkdirSync(path.dirname(requestPath), { recursive: true });
  fs.writeFileSync(
    requestPath,
    `${JSON.stringify({ requestedAt: new Date().toISOString(), ...status.update }, null, 2)}\n`
  );
  return { accepted: true, version: status.update.version };
};
