import { Router } from "express";
import { BusinessController } from "../controllers/business.controller.js";
import { requireAuth, requireBusinessAdmin } from "../middleware/auth.middleware.js";

const router = Router();
router.use(requireAuth);

router.get("/me/reference-data", BusinessController.referenceData);
router.patch("/me/reference-data", requireBusinessAdmin, BusinessController.updateReferenceData);
router.get("/me/rule-data", BusinessController.ruleData);
router.patch("/me/rule-data", requireBusinessAdmin, BusinessController.updateRuleData);
router.get("/me/invoice-counter", BusinessController.invoiceCounter);

export default router;
