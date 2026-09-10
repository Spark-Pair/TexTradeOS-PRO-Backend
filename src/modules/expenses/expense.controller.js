import { createExpense, deleteExpense, listExpenses } from "./expense.service.js";

const send = (res, action) => {
  try { return action(); }
  catch (error) { return res.status(error.status || 500).json({ message: error.message || "Expense operation failed" }); }
};

export const ExpenseController = {
  list: (req, res) => send(res, () => res.json({ success: true, data: listExpenses(req.user.business_id, req.query) })),
  create: (req, res) => send(res, () => res.status(201).json({ success: true, data: createExpense({ businessId: req.user.business_id, userId: req.user.id, body: req.body }) })),
  delete: (req, res) => send(res, () => res.json(deleteExpense(req.user.business_id, req.params.id))),
};
