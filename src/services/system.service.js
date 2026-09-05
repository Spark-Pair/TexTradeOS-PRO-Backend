import fs from "node:fs";
import { validateLicense } from "../license.js";
import { checkForUpdate } from "../updates.js";
import {
  getBackupPath,
  listBackups,
  readLauncherLog,
  readLauncherResult,
  submitSystemCommand,
  stageRestoreUpload,
} from "../management.js";

const APP_VERSION = process.env.APP_VERSION || "0.0.0";

export const SystemService = {
  async status() {
    const update = await checkForUpdate();
    const databaseStats = fs.statSync(process.env.DATABASE_PATH || "./textradeos.sqlite");
    return {
      version: APP_VERSION,
      license: validateLicense(),
      update,
      databaseSize: databaseStats.size,
      backups: listBackups(),
    };
  },

  diagnostics() {
    const databasePath = process.env.DATABASE_PATH || "./textradeos.sqlite";
    return {
      generatedAt: new Date().toISOString(),
      version: APP_VERSION,
      node: process.version,
      platform: process.platform,
      license: validateLicense(),
      database: {
        path: databasePath,
        size: fs.existsSync(databasePath) ? fs.statSync(databasePath).size : 0,
      },
      backups: listBackups(),
      launcherLog: readLauncherLog(),
    };
  },

  backupPath(name) {
    return getBackupPath(name);
  },

  async stageRestore(req, fileName) {
    return stageRestoreUpload(req, fileName);
  },

  submitRestoreUpload(upload) {
    return submitSystemCommand("restore-upload", upload);
  },

  submitCommand(type, backup) {
    const allowed = new Set(["backup", "restore", "firewall"]);
    if (!allowed.has(type)) {
      const error = new Error("Unsupported system operation");
      error.status = 400;
      throw error;
    }
    if (type === "restore" && !/^textradeos-\d{8}-\d{6}\.sqlite$/i.test(String(backup || ""))) {
      const error = new Error("Select a valid backup");
      error.status = 400;
      throw error;
    }
    return submitSystemCommand(type, type === "restore" ? { backup } : {});
  },

  commandStatus(id) {
    return readLauncherResult(id) || { id, state: "pending" };
  },
};
