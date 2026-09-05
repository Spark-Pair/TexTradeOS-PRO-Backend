import { Router } from "express";
import { DashboardController } from "../controllers/dashboard.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
router.use(requireAuth);
router.get("/trend", DashboardController.trend);

export default router;
