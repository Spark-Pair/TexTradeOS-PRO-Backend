import { Router } from "express";
import { PaymentController } from "./payment.controller.js";
import { ClearanceController } from "./clearance.controller.js";

export function createPaymentRouter(requireAuth) {
  const router = Router();
  router.use(requireAuth);
  router.get("/invoices/:invoiceId", PaymentController.list);
  router.post("/invoices/:invoiceId", PaymentController.create);
  router.put("/:id", PaymentController.update);
  router.delete("/:id", PaymentController.remove);
  router.get("/clearances/:source/:paymentId", ClearanceController.list);
  router.post("/clearances/:source/:paymentId", ClearanceController.create);
  return router;
}
