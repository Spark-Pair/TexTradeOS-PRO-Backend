import { Router } from "express";
import { InvoiceController } from "../controllers/invoice.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
router.use(requireAuth);
router.get("/", InvoiceController.list);
router.get("/order-groups", InvoiceController.orderGroups);
router.get("/shared-ledger", InvoiceController.sharedLedger);
router.get("/:id", InvoiceController.get);
router.post("/", InvoiceController.create);
router.delete("/:id", InvoiceController.delete);

export default router;
