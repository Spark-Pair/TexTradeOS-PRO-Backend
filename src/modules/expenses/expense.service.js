import { now } from "../../utils.js";
import { ExpenseModel } from "./expense.model.js";

const text = (value) => String(value ?? "").trim();
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const methods = new Set(["cash", "cheque", "slip", "online"]);

const toDto = (row) => row ? ({
  id: String(row.id),
  expense_date: row.expense_date || "",
  category: row.category || "",
  paid_to: row.paid_to || "",
  method: row.method || "",
  amount: Number(row.amount || 0),
  reference_no: row.reference_no || "",
  bank_name: row.bank_name || "",
  cheque_date: row.cheque_date || "",
  slip_date: row.slip_date || "",
  notes: row.notes || "",
  created_at: row.created_at,
  updated_at: row.updated_at,
}) : null;

export function listExpenses(businessId, filters = {}) {
  const category = text(filters.category).toLowerCase();
  const method = text(filters.method);
  const dateFrom = text(filters.date_from).slice(0, 10);
  const dateTo = text(filters.date_to).slice(0, 10);
  return ExpenseModel.list(businessId)
    .filter((row) => (!category || String(row.category || "").toLowerCase().includes(category)) && (!method || row.method === method) && (!dateFrom || String(row.expense_date).slice(0, 10) >= dateFrom) && (!dateTo || String(row.expense_date).slice(0, 10) <= dateTo))
    .map(toDto);
}

export function createExpense({ businessId, userId, body = {} }) {
  const category = text(body.category);
  const amount = num(body.amount);
  const method = text(body.method).toLowerCase();
  if (!category) throw Object.assign(new Error("Expense category is required"), { status: 400 });
  if (!methods.has(method)) throw Object.assign(new Error("Invalid payment method"), { status: 400 });
  if (amount <= 0) throw Object.assign(new Error("Expense amount must be greater than zero"), { status: 400 });
  const ts = now();
  const result = ExpenseModel.insert([businessId, userId, text(body.expense_date) || ts.slice(0, 10), category, text(body.paid_to), method, amount, method === "cash" ? "" : text(body.reference_no), method === "cheque" ? text(body.bank_name) : "", method === "cheque" ? text(body.cheque_date) : "", method === "slip" ? text(body.slip_date) : "", text(body.notes), ts, ts]);
  return toDto(ExpenseModel.find(businessId, result.lastInsertRowid));
}

export function deleteExpense(businessId, id) {
  const existing = ExpenseModel.find(businessId, id);
  if (!existing) throw Object.assign(new Error("Expense not found"), { status: 404 });
  ExpenseModel.delete(businessId, id);
  return { success: true };
}
