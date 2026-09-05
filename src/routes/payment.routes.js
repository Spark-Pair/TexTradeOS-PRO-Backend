import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { PaymentController } from "../controllers/payment.controller.js";
const router=Router();router.use(requireAuth);router.get("/invoices/:invoiceId",PaymentController.list);router.post("/invoices/:invoiceId",PaymentController.create);export default router;
