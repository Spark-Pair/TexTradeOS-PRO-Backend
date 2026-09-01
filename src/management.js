import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";

const dataDirectory = path.dirname(path.resolve(process.env.DATABASE_PATH || "./textradeos.sqlite"));
const commandDirectory = path.join(dataDirectory, "launcher-commands");
const resultDirectory = path.join(dataDirectory, "launcher-results");
const backupDirectory = path.resolve(process.env.BACKUP_PATH || "/backups");
const restoreUploadDirectory = path.join(dataDirectory, "restore-uploads");
const managementSecret = String(process.env.MANAGEMENT_SECRET || "");
const databasePath = path.resolve(process.env.DATABASE_PATH || "./textradeos.sqlite");

const ensureDirectories = () => {
  fs.mkdirSync(commandDirectory, { recursive: true });
  fs.mkdirSync(resultDirectory, { recursive: true });
};

export const submitLauncherCommand = (type, payload = {}) => {
  if (!managementSecret) throw new Error("Launcher management is not configured");
  ensureDirectories();
  const id = uuidv4();
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

export const submitSystemCommand = (type, payload = {}) => {
  if (managementSecret) return submitLauncherCommand(type, payload);
  if (process.env.NODE_ENV === "production") {
    throw new Error("Launcher management is not configured");
  }

  ensureDirectories();
  const id = uuidv4();
  const resultPath = path.join(resultDirectory, `${id}.json`);
  setImmediate(async () => {
    try {
      let result;
      if (type === "backup") {
        fs.mkdirSync(backupDirectory, { recursive: true });
        const stamp = new Date().toISOString().replace(/\D/g, "");
        const name = `textradeos-${stamp.slice(0, 8)}-${stamp.slice(8, 14)}.sqlite`;
        const source = new Database(databasePath, { readonly: true });
        try { await source.backup(path.join(backupDirectory, name)); } finally { source.close(); }
        result = { backup: name };
      } else if (type === "restore" || type === "restore-upload") {
        const uploaded = type === "restore-upload";
        const sourcePath = uploaded
          ? path.join(restoreUploadDirectory, String(payload.fileName || ""))
          : getBackupPath(payload.backup);
        if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error("Selected backup does not exist");
        const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
        try {
          const integrity = source.pragma("integrity_check", { simple: true });
          const tables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
          if (integrity !== "ok" || ["businesses", "users", "invoices", "invoice_items"].some((name) => !tables.has(name))) {
            throw new Error("Invalid TexTradeOS database backup");
          }
          await source.backup(databasePath);
        } finally {
          source.close();
          if (uploaded) fs.rmSync(sourcePath, { force: true });
        }
        result = { restored: true };
      } else if (type === "firewall") {
        throw new Error("Firewall configuration is only available through the installed launcher");
      } else {
        throw new Error("Unsupported system operation");
      }
      fs.writeFileSync(resultPath, JSON.stringify({ id, state: "completed", result }));
    } catch (error) {
      fs.writeFileSync(resultPath, JSON.stringify({ id, state: "failed", message: error.message }));
    }
  });
  return { id, state: "queued", execution: "local" };
};

export const getBackupPath = (name) => {
  const fileName = String(name || "");
  if (!/^textradeos-\d{8}-\d{6}\.sqlite$/i.test(fileName)) return null;
  const filePath = path.join(backupDirectory, fileName);
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : null;
};

export const stageRestoreUpload = (readable, originalName) => new Promise((resolve, reject) => {
  fs.mkdirSync(restoreUploadDirectory, { recursive: true });
  const id = uuidv4();
  const fileName = `${id}.sqlite`;
  const filePath = path.join(restoreUploadDirectory, fileName);
  const output = fs.createWriteStream(filePath, { flags: "wx" });
  let size = 0;
  const maximumSize = 2 * 1024 * 1024 * 1024;

  const fail = (error) => {
    output.destroy();
    fs.rm(filePath, { force: true }, () => reject(error));
  };

  readable.on("data", (chunk) => {
    size += chunk.length;
    if (size > maximumSize) fail(new Error("Backup file is larger than 2 GB"));
  });
  readable.on("error", fail);
  output.on("error", fail);
  output.on("finish", () => {
    if (size < 100) return fs.rm(filePath, { force: true }, () => reject(new Error("Backup file is empty or invalid")));
    resolve({ fileName, originalName: path.basename(String(originalName || "backup.sqlite")), size });
  });
  readable.pipe(output);
});

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
