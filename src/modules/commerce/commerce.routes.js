import express from "express";
import { createInventoryRouter } from "../inventory/inventory.routes.js";
import { createPartyRouter } from "../parties/party.routes.js";
import { createPurchaseRouter } from "../purchases/purchase.routes.js";

const retiredCompatibilityEndpoints = [
  "/shared-data",
  "/invoices/shared-ledger",
  "/invoices/order-groups",
];

/**
 * Composes normalized commerce endpoints behind one /api mount point.
 * Business data is served only by normalized, database-backed resources.
 * Retired prototype/compatibility endpoints are explicitly blocked here so
 * older handlers cannot become reachable if legacy server code is present.
 */
export function createCommerceRouter(requireAuth) {
  const router = express.Router();

  retiredCompatibilityEndpoints.forEach((path) => {
    router.all(path, requireAuth, (req, res) => {
      res.status(410).json({
        success: false,
        code: "ENDPOINT_RETIRED",
        message: "This compatibility endpoint has been retired. Use the normalized database-backed API.",
      });
    });
  });

  router.use(createPartyRouter(requireAuth));
  router.use("/purchases", createPurchaseRouter(requireAuth));
  router.use("/inventory", createInventoryRouter(requireAuth));
  return router;
}
