import express from "express";
import { PurchaseController } from "./purchase.controller.js";

export function createPurchaseRouter(requireAuth) {
  const router = express.Router();
  router.use(requireAuth);
  router.get("/", PurchaseController.list);
  router.get("/articles/:articleNo/usage", PurchaseController.articleUsage);
  router.get("/:id", PurchaseController.get);
  router.post("/", PurchaseController.create);
  router.put("/:id", PurchaseController.update);
  router.delete("/:id", PurchaseController.delete);
  return router;
}
