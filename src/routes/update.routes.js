import { Router } from "express";
import { UpdateController } from "../controllers/update.controller.js";
import { requireAuth, requireBusinessAdmin } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/status", requireAuth, UpdateController.status);
router.post("/install", requireAuth, requireBusinessAdmin, UpdateController.install);

export default router;
