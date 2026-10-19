import express from "express";
import { BankAccountController } from "./bank-account.controller.js";
export function createBankAccountRouter(requireAuth) {
  const router = express.Router(); router.use(requireAuth);
  router.get("/bank-accounts", BankAccountController.list);
  router.post("/bank-accounts", BankAccountController.create);
  router.put("/bank-accounts/:id", BankAccountController.update);
  router.patch("/bank-accounts/:id/toggle-status", BankAccountController.toggle);
  return router;
}
