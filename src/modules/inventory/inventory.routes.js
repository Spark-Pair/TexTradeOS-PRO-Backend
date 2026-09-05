import express from "express";
import { getInventory } from "./inventory.service.js";

export function createInventoryRouter(requireAuth) {
  const router = express.Router();

  router.get("/", requireAuth, (req, res) => {
    res.json({ success: true, data: getInventory(req.user.business_id) });
  });

  return router;
}
