import { Router } from "express";
import { SystemController } from "../controllers/system.controller.js";
import { requireAuth, requireBusinessAdmin } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth, requireBusinessAdmin);
router.get("/status", SystemController.status);
router.get("/diagnostics", SystemController.diagnostics);
router.get("/backups/:name/download", SystemController.downloadBackup);
router.post("/restore-upload", SystemController.restoreUpload);
router.post("/commands", SystemController.command);
router.get("/commands/:id", SystemController.commandStatus);

export default router;
