import express from "express";
import { getInventory, getInventoryMovements } from "./inventory.service.js";

export function createInventoryRouter(requireAuth) {
  const router = express.Router();

  router.get("/", requireAuth, (req, res) => {
    res.json({ success: true, data: getInventory(req.user.business_id) });
  });

  router.get("/:articleNo/movements", requireAuth, (req, res) => {
    const purchaseNumber = String(req.query.purchase_number || "").trim();
    if (!purchaseNumber) return res.status(400).json({ message: "purchase_number is required" });
    res.json({
      success: true,
      data: getInventoryMovements(req.user.business_id, String(req.params.articleNo || "").trim(), purchaseNumber),
    });
  });

  return router;
}
