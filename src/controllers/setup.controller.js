import { validateLicense } from "../license.js";
import { readFingerprint, readLauncherResult, submitLauncherCommand } from "../management.js";

const APP_VERSION = process.env.APP_VERSION || "0.0.0";

export const SetupController = {
  health(req, res) {
    const license = validateLicense();
    res.json({
      ok: true,
      app: "TexTradeOS PRO Backend",
      version: APP_VERSION,
      license: { allowed: license.allowed, code: license.code },
    });
  },

  version(req, res) {
    res.json({ version: APP_VERSION });
  },

  licenseStatus(req, res) {
    const result = validateLicense();
    res.status(result.allowed ? 200 : 403).json(result);
  },

  setupStatus(req, res) {
    res.json({ license: validateLicense(), version: APP_VERSION });
  },

  fingerprint(req, res) {
    try {
      const fingerprint = readFingerprint();
      res.setHeader("Content-Disposition", "attachment; filename=TexTradeOS-PRO-Fingerprint.json");
      res.json(fingerprint);
    } catch {
      res.status(404).json({ message: "Device fingerprint is not available" });
    }
  },

  importLicense(req, res) {
    if (!req.body?.payload || !req.body?.signature) {
      return res.status(400).json({ message: "Select a valid TexTradeOS PRO license file" });
    }
    res.status(202).json(submitLauncherCommand("import-license", { document: req.body }));
  },

  commandStatus(req, res) {
    const result = readLauncherResult(req.params.id);
    res.json(result || { id: req.params.id, state: "pending" });
  },
};
