import express from "express";
import { InventoryController } from "./inventory.controller.js";

export function createInventoryRouter(requireAuth) {
  const router = express.Router();
  router.use(requireAuth);
  router.get("/", InventoryController.list);
  router.get("/:articleNo/movements", InventoryController.movements);
  return router;
}
