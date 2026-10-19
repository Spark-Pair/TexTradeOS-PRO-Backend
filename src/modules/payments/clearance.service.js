import { db } from "../../db/connection.js";
import { findSourcePayment, insertClearance, listClearances } from "./clearance.model.js";

const text = (value) => String(value ?? "").trim();
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const validSource = new Set(["party", "invoice"]);
const validMethods = new Set(["transfer", "online"]);

const normalizeSource = (source) => {
  const value = text(source).toLowerCase();
  if (!validSource.has(value)) throw Object.assign(new Error("Invalid payment source"), { statusCode: 400 });
  return value;
};

const sourcePayment = (businessId, source, paymentId) => {
  const payment = findSourcePayment(businessId, source, paymentId);
  if (!payment) throw Object.assign(new Error("Payment not found"), { statusCode: 404 });
  if (!["cheque", "slip"].includes(payment.method)) throw Object.assign(new Error("Only cheque or slip payments can be cleared"), { statusCode: 400 });
  if (source === "party" && payment.cheque_type === "self") throw Object.assign(new Error("Self cheque cannot be cleared"), { statusCode: 400 });
  if (source === "party" && payment.party_type === "customer" && !payment.bank_account_id) {
    const issued = db.prepare("SELECT id FROM party_payments WHERE business_id=? AND source_payment_id=? LIMIT 1").get(businessId, String(payment.id));
    if (!issued) throw Object.assign(new Error("Pending cheque/slip cannot be cleared until it is issued"), { statusCode: 400 });
  }
  return payment;
};

export const getPaymentClearances = (businessId, source, paymentId) => {
  const normalizedSource = normalizeSource(source);
  sourcePayment(businessId, normalizedSource, paymentId);
  return listClearances(businessId, normalizedSource, paymentId).map((row) => ({
    id: String(row.id), clearance_date: row.clearance_date, clearance_method: row.clearance_method,
    amount: Number(row.amount || 0), reference_no: row.reference_no || "", notes: row.notes || "", settlement_method: row.settlement_method || "transfer",
    bank_account_id: row.bank_account_id || "", bank_account_title: row.bank_account_title || "", bank_account_bank: row.bank_account_bank || "", settlement_bank_name: row.settlement_bank_name || "", settlement_date: row.settlement_date || "",
  }));
};

export const createPaymentClearance = (businessId, userId, source, paymentId, payload = {}) => {
  const normalizedSource = normalizeSource(source);
  const payment = sourcePayment(businessId, normalizedSource, paymentId);
  const method = text(payload.settlement_method || payload.clearance_method).toLowerCase();
  const amount = num(payload.amount);
  const clearanceDate = text(payload.clearance_date);
  const bankAccountId = text(payload.bank_account_id);
  const validSettlementMethods = new Set(["cash", "cheque", "slip", "transfer", "online"]);
  if (!validSettlementMethods.has(method)) throw Object.assign(new Error("Select how the cheque/slip was settled"), { statusCode: 400 });
  if (amount <= 0) throw Object.assign(new Error("Clearance amount must be greater than zero"), { statusCode: 400 });
  if (!clearanceDate) throw Object.assign(new Error("Clearance date is required"), { statusCode: 400 });
  if (["online", "transfer"].includes(method) && !bankAccountId) throw Object.assign(new Error("Select the destination account"), { statusCode: 400 });
  if (bankAccountId) {
    const account = db.prepare("SELECT id FROM bank_accounts WHERE business_id=? AND id=? AND is_active=1").get(businessId, bankAccountId);
    if (!account) throw Object.assign(new Error("Invalid clearance account"), { statusCode: 400 });
  }
  const ts = new Date().toISOString();
  const result = insertClearance([businessId, normalizedSource, payment.id, userId, clearanceDate, method === "online" || method === "transfer" ? method : "transfer", amount, text(payload.reference_no), bankAccountId, text(payload.notes), ts, ts, method, text(payload.settlement_bank_name), text(payload.settlement_date)]);
  return { id: String(result.lastInsertRowid), clearances: listClearances(businessId, normalizedSource, payment.id) };
};
