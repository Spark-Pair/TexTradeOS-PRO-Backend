import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
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
  const configuredPath = path.resolve(process.env.FINGERPRINT_PATH || "./license/fingerprint.json");
  const candidates = [configuredPath];

  if (process.platform === "win32") {
    candidates.push(path.join(
      process.env.ProgramData || "C:\\ProgramData",
      "TexTradeOS",
      "license",
      "fingerprint.json"
    ));
  }

  for (const filePath of new Set(candidates)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
    } catch {
      // Try the next known launcher location.
    }
  }

  if (process.platform !== "win32" || process.env.NODE_ENV === "production") {
    throw new Error("Device fingerprint is not available");
  }

  const runPowerShell = (command) => {
    try {
      return execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", command],
        { encoding: "utf8", timeout: 10000, windowsHide: true }
      ).trim();
    } catch {
      return "";
    }
  };
  const hash = (value) => crypto
    .createHash("sha256")
    .update(String(value || "").trim().toUpperCase(), "utf8")
    .digest("hex");

  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    fingerprints: {
      baseboardSerial: hash(runPowerShell("(Get-CimInstance Win32_BaseBoard).SerialNumber")),
      biosSerial: hash(runPowerShell("(Get-CimInstance Win32_BIOS).SerialNumber")),
      machineGuid: hash(runPowerShell(
        "(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography').MachineGuid"
      )),
      systemUuid: hash(runPowerShell("(Get-CimInstance Win32_ComputerSystemProduct).UUID")),
    },
  };
};

export const readLauncherLog = () => {
  try {
    const lines = fs.readFileSync(path.join(dataDirectory, "launcher.log"), "utf8").split(/\r?\n/);
    return lines.slice(-250).join("\n");
  } catch {
    return "No launcher log is available.";
  }
};
