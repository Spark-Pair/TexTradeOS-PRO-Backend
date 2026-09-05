import { Router } from "express";
import { PaymentController } from "./payment.controller.js";

export function createPaymentRouter(requireAuth) {
  const router = Router();
  router.use(requireAuth);
  router.get("/invoices/:invoiceId", PaymentController.list);
  router.post("/invoices/:invoiceId", PaymentController.create);
  return router;
}
