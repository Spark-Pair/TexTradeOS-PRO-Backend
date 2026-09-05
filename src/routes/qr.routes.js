import { Router } from "express";
import { QrController } from "../controllers/qr.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

router.use(requireAuth);
router.post("/article/sign", QrController.signArticle);
router.post("/article/verify", QrController.verifyArticle);

export default router;
