import { SystemService } from "../services/system.service.js";

export const SystemController = {
  async status(req, res, next) {
    try {
      res.json(await SystemService.status());
    } catch (error) {
      next(error);
    }
  },

  diagnostics(req, res) {
    res.setHeader("Content-Disposition", "attachment; filename=TexTradeOS-PRO-Diagnostics.json");
    res.json(SystemService.diagnostics());
  },

  downloadBackup(req, res) {
    const filePath = SystemService.backupPath(req.params.name);
    if (!filePath) return res.status(404).json({ message: "Backup not found" });
    res.download(filePath, req.params.name);
  },

  async restoreUpload(req, res, next) {
    try {
      if (req.is("application/octet-stream") === false) {
        return res.status(415).json({ message: "Select a SQLite backup file" });
      }
      const upload = await SystemService.stageRestore(req, req.get("x-file-name"));
      res.status(202).json(SystemService.submitRestoreUpload(upload));
    } catch (error) {
      next(error);
    }
  },

  command(req, res) {
    try {
      res.status(202).json(SystemService.submitCommand(String(req.body?.type || ""), req.body?.backup));
    } catch (error) {
      res.status(error.status || 500).json({ message: error.message });
    }
  },

  commandStatus(req, res) {
    res.json(SystemService.commandStatus(req.params.id));
  },
};
