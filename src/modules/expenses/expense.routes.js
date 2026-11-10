import { Router } from "express";
import { ExpenseController } from "./expense.controller.js";
import { requireBusinessAdmin } from "../../middleware/auth.middleware.js";

export function createExpenseRouter(requireAuth) {
  const router = Router();
  router.use(requireAuth);
  router.get("/", ExpenseController.list);
  router.post("/", ExpenseController.create);
  router.put("/:id", requireBusinessAdmin, ExpenseController.update);
  router.delete("/:id", ExpenseController.delete);
  return router;
}
