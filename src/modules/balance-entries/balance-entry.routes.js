import express from "express";
import { BalanceEntryController } from "./balance-entry.controller.js";

export function createBalanceEntryRouter(requireAuth) {
  const router = express.Router();
  router.use(requireAuth);
  router.get("/balance-entries", BalanceEntryController.list);
  router.post("/balance-entries", BalanceEntryController.create);
  return router;
}
