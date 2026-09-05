import express from "express";
import { createPartyRouter } from "../parties/party.routes.js";
import { createPurchaseRouter } from "../purchases/purchase.routes.js";

/**
 * Composes normalized commerce endpoints behind one mount point.
 * Mount this router at /api so the frontend can use:
 * /api/customers, /api/suppliers and /api/purchases.
 */
export function createCommerceRouter(requireAuth) {
  const router = express.Router();
  router.use(createPartyRouter(requireAuth));
  router.use(createPurchaseRouter(requireAuth));
  return router;
}
