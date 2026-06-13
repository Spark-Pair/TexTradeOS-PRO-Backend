import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dataDirectory = path.dirname(path.resolve(process.env.DATABASE_PATH || "./textradeos.sqlite"));
const commandDirectory = path.join(dataDirectory, "launcher-commands");
const resultDirectory = path.join(dataDirectory, "launcher-results");
const backupDirectory = path.resolve(process.env.BACKUP_PATH || "/backups");
const managementSecret = String(process.env.MANAGEMENT_SECRET || "");

const ensureDirectories = () => {
  fs.mkdirSync(commandDirectory, { recursive: true });
  fs.mkdirSync(resultDirectory, { recursive: true });
};

export const submitLauncherCommand = (type, payload = {}) => {
  if (!managementSecret) throw new Error("Launcher management is not configured");
  ensureDirectories();
  const id = crypto.randomUUID();
  const command = {
    id,
    type,
    payload,
    secret: managementSecret,
    createdAt: new Date().toISOString(),
  };
  const temporary = path.join(commandDirectory, `${id}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(command, null, 2)}\n`);
  fs.renameSync(temporary, path.join(commandDirectory, `${id}.json`));
  return { id, state: "queued" };
};

export const readLauncherResult = (id) => {
  if (!/^[a-f0-9-]{36}$/i.test(String(id || ""))) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(resultDirectory, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
};

export const listBackups = () => {
  try {
    return fs.readdirSync(backupDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^textradeos-\d{8}-\d{6}\.sqlite$/i.test(entry.name))
      .map((entry) => {
        const stats = fs.statSync(path.join(backupDirectory, entry.name));
        return {
          name: entry.name,
          size: stats.size,
          createdAt: stats.mtime.toISOString(),
        };
      })
      .sort((left, right) => right.name.localeCompare(left.name));
  } catch {
    return [];
  }
};

export const readFingerprint = () => {
  const filePath = path.resolve(process.env.FINGERPRINT_PATH || "./license/fingerprint.json");
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
};

export const readLauncherLog = () => {
  try {
    const lines = fs.readFileSync(path.join(dataDirectory, "launcher.log"), "utf8").split(/\r?\n/);
    return lines.slice(-250).join("\n");
  } catch {
    return "No launcher log is available.";
  }
};
