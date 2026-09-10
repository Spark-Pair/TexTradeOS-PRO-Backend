import { Router } from "express";
import { ExpenseController } from "./expense.controller.js";

export function createExpenseRouter(requireAuth) {
  const router = Router();
  router.use(requireAuth);
  router.get("/", ExpenseController.list);
  router.post("/", ExpenseController.create);
  router.delete("/:id", ExpenseController.delete);
  return router;
}
