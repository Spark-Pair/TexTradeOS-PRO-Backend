import { Router } from "express";
import { SharedDataController } from "../controllers/shared-data.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
router.use(requireAuth);
router.get("/", SharedDataController.list);
router.put("/:collection", SharedDataController.save);

export default router;
