import express from "express";
import { createInventoryRouter } from "../inventory/inventory.routes.js";
import { createPartyRouter } from "../parties/party.routes.js";
import { createPurchaseRouter } from "../purchases/purchase.routes.js";

/**
 * Composes normalized commerce endpoints behind one /api mount point.
 * Party routes already include /customers and /suppliers paths, while
 * purchase and inventory routers are relative to their resource mounts.
 */
export function createCommerceRouter(requireAuth) {
  const router = express.Router();
  router.use(createPartyRouter(requireAuth));
  router.use("/purchases", createPurchaseRouter(requireAuth));
  router.use("/inventory", createInventoryRouter(requireAuth));
  return router;
}
