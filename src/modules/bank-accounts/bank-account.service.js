import crypto from "node:crypto";
import { db } from "../../db/connection.js";
import { getBankAccount, listBankAccounts, saveBankAccount, setBankAccountStatus } from "./bank-account.model.js";

const text = (value) => String(value ?? "").trim();
const categories = new Set(["customer", "supplier", "self"]);
const notFound = Object.assign(new Error("Bank account not found"), { statusCode: 404 });
const dto = (row) => row && ({ _id: row.id, category: row.category, party_id: row.party_id || "", party_name: row.party_name || "", account_title: row.account_title, account_no: row.account_no || "", bank_name: row.bank_name || "", cheque_serial_start: row.cheque_serial_start || "", cheque_serial_end: row.cheque_serial_end || "", isActive: Boolean(row.is_active), createdAt: row.created_at, updatedAt: row.updated_at });
const validate = (payload = {}) => {
  const category = text(payload.category).toLowerCase();
  const accountTitle = text(payload.account_title);
  if (!categories.has(category)) throw Object.assign(new Error("Valid account category is required"), { statusCode: 400 });
  if (!accountTitle) throw Object.assign(new Error("Account title is required"), { statusCode: 400 });
  const bankName = text(payload.bank_name);
  if (!bankName) throw Object.assign(new Error("Bank is required"), { statusCode: 400 });
  const partyId = category === "self" ? "" : text(payload.party_id);
  if (category !== "self") {
    if (!partyId) throw Object.assign(new Error(`${category === "customer" ? "Customer" : "Supplier"} is required`), { statusCode: 400 });
    const table = category === "customer" ? "customers" : "suppliers";
    const exists = db.prepare(`SELECT id FROM ${table} WHERE business_id=? AND id=?`).get(payload.business_id, partyId);
    if (!exists) throw Object.assign(new Error(`Selected ${category} was not found`), { statusCode: 400 });
  }
  return { category, party_id: partyId, account_title: accountTitle, account_no: text(payload.account_no), bank_name: bankName, cheque_serial_start: category === "self" ? text(payload.cheque_serial_start) : "", cheque_serial_end: category === "self" ? text(payload.cheque_serial_end) : "" };
};

export const listBankAccountDtos = (businessId) => listBankAccounts(businessId).map(dto);
export const createBankAccount = (businessId, payload = {}) => { const values = validate({ ...payload, business_id: businessId }); const now = new Date().toISOString(); return dto(saveBankAccount({ ...values, id: crypto.randomUUID(), business_id: businessId, is_active: payload.isActive ?? true, created_at: now, updated_at: now })); };
export const updateBankAccount = (businessId, id, payload = {}) => { const existing = getBankAccount(businessId, id); if (!existing) throw notFound; const values = validate({ ...payload, business_id: businessId }); return dto(saveBankAccount({ ...values, id: existing.id, business_id: businessId, is_active: payload.isActive ?? Boolean(existing.is_active), created_at: existing.created_at, updated_at: new Date().toISOString() })); };
export const toggleBankAccount = (businessId, id) => { const existing = getBankAccount(businessId, id); if (!existing) throw notFound; return dto(setBankAccountStatus(businessId, id, !existing.is_active, new Date().toISOString())); };
