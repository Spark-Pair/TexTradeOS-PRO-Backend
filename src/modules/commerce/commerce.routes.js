import express from "express";
import { createPartyRouter } from "../parties/party.routes.js";
import { createPurchaseRouter } from "../purchases/purchase.routes.js";

/**
 * Composes normalized commerce endpoints behind one /api mount point.
 * Party routes already include /customers and /suppliers paths, while
 * purchase routes are intentionally relative to their /purchases mount.
 */
export function createCommerceRouter(requireAuth) {
  const router = express.Router();
  router.use(createPartyRouter(requireAuth));
  router.use("/purchases", createPurchaseRouter(requireAuth));
  return router;
}
