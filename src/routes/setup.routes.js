import { Router } from "express";
import { SetupController } from "../controllers/setup.controller.js";

const router = Router();

router.get("/health", SetupController.health);
router.get("/version", SetupController.version);
router.get("/license/status", SetupController.licenseStatus);
router.get("/setup/status", SetupController.setupStatus);
router.get("/setup/fingerprint", SetupController.fingerprint);
router.post("/setup/license", SetupController.importLicense);
router.get("/setup/commands/:id", SetupController.commandStatus);

export default router;
