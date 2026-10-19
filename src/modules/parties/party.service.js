import crypto from "node:crypto";
import { db } from "../../db/connection.js";
import { deletePartyPayment as removePartyPayment, getParty, getPartyBalance, getPartyLedger, getPartyPayment, insertPartyPayment, listParties, listPayments, setPartyStatus, updatePartyPayment as persistPartyPayment, upsertParty } from "./party.model.js";

const text = (value) => String(value || "").trim();
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const methods = new Set(["cash", "cheque", "slip", "online"]);
const partyLabel = (kind) => kind === "customers" ? "Customer" : "Supplier";
const notFound = (kind) => Object.assign(new Error(`${partyLabel(kind)} not found`), { statusCode: 404 });
const partyType = (kind) => kind === "customers" ? "customer" : "supplier";

const toDto = (kind, row, balance = null) => row ? ({
  _id: row.id,
  [`${kind === "customers" ? "customer" : "supplier"}_name`]: row[kind === "customers" ? "customer_name" : "supplier_name"],
  person_name: row.person_name || "", urdu_title: row.urdu_title || "", phone_number: row.phone_number || "", address: row.address || "", city: row.city || "", isActive: Boolean(row.is_active),
  balance: Number(balance?.balance || 0), total_debit: Number(balance?.charges || 0), total_credit: Number(balance?.credits || 0), createdAt: row.created_at, updatedAt: row.updated_at,
}) : null;

export const listPartyDtos = (kind, businessId) => listParties(kind, businessId).map((row) => toDto(kind, row, getPartyBalance(kind, businessId, row.id)));
export const getPartyStatement = (kind, businessId, id, filters = {}) => { const row = getParty(kind, businessId, id); if (!row) throw notFound(kind); return { party: toDto(kind, row, getPartyBalance(kind, businessId, id)), ...getPartyLedger(kind, businessId, id, filters) }; };

export const createParty = (kind, businessId, payload = {}) => {
  const nameKey = kind === "customers" ? "customer_name" : "supplier_name"; const name = text(payload[nameKey]);
  if (!name) throw Object.assign(new Error(`${partyLabel(kind)} name is required`), { statusCode: 400 });
  const timestamp = new Date().toISOString();
  const row = upsertParty(kind, businessId, { id: crypto.randomUUID(), name, person_name: text(payload.person_name), urdu_title: text(payload.urdu_title), phone_number: text(payload.phone_number), address: text(payload.address), city: text(payload.city), is_active: payload.isActive ?? true, created_at: timestamp, updated_at: timestamp });
  return toDto(kind, row, getPartyBalance(kind, businessId, row.id));
};

export const updateParty = (kind, businessId, id, payload = {}) => {
  const existing = getParty(kind, businessId, id); if (!existing) throw notFound(kind); const nameKey = kind === "customers" ? "customer_name" : "supplier_name"; const name = text(payload[nameKey]);
  if (!name) throw Object.assign(new Error(`${partyLabel(kind)} name is required`), { statusCode: 400 });
  const row = upsertParty(kind, businessId, { id: existing.id, name, person_name: text(payload.person_name), urdu_title: text(payload.urdu_title), phone_number: text(payload.phone_number), address: text(payload.address), city: text(payload.city), is_active: payload.isActive ?? Boolean(existing.is_active), created_at: existing.created_at, updated_at: new Date().toISOString() });
  return toDto(kind, row, getPartyBalance(kind, businessId, row.id));
};

export const toggleParty = (kind, businessId, id) => { const existing = getParty(kind, businessId, id); if (!existing) throw notFound(kind); const row = setPartyStatus(kind, businessId, id, !existing.is_active, new Date().toISOString()); return toDto(kind, row, getPartyBalance(kind, businessId, row.id)); };

export const createPartyPayment = (kind, businessId, userId, id, payload = {}) => {
  const existing = getParty(kind, businessId, id);
  if (!existing) throw notFound(kind);
  const method = text(payload.method).toLowerCase();
  const chequeType = method === "self_cheque" ? "self" : text(payload.cheque_type);
  const normalizedMethod = method === "self_cheque" ? "cheque" : method;
  const amount = num(payload.amount);
  if (!methods.has(normalizedMethod)) throw Object.assign(new Error("Invalid payment method"), { statusCode: 400 });
  if (amount <= 0) throw Object.assign(new Error("Payment amount must be greater than zero"), { statusCode: 400 });
  const bankAccountId = text(payload.bank_account_id);
  const sourcePaymentId = text(payload.source_payment_id);
  const chequeNo = text(payload.cheque_no);
  const chequeAccountId = text(payload.cheque_account_id);
  const clearingDate = normalizedMethod === "cheque" || normalizedMethod === "slip" ? text(payload.clearing_date) : "";
  if (chequeType === "self" && partyType(kind) !== "supplier") throw Object.assign(new Error("Self cheque can only be issued to a supplier"), { statusCode: 400 });
  if (normalizedMethod === "online" && !bankAccountId) throw Object.assign(new Error("Online payment account is required"), { statusCode: 400 });
  let bankAccount = null;
  if (bankAccountId) {
    bankAccount = db.prepare("SELECT * FROM bank_accounts WHERE business_id=? AND id=? AND is_active=1").get(businessId, bankAccountId);
    const allowedCategories = partyType(kind) === "supplier" && normalizedMethod === "online" ? ["customer", "self"] : ["supplier", "self"];
    if (!bankAccount || !allowedCategories.includes(bankAccount.category)) throw Object.assign(new Error("Invalid payment account"), { statusCode: 400 });
  }
  if (sourcePaymentId) {
    if (partyType(kind) !== "supplier") throw Object.assign(new Error("Pending customer instruments can only be used for supplier payments"), { statusCode: 400 });
    const source = db.prepare("SELECT * FROM party_payments WHERE business_id=? AND id=? AND party_type='customer' AND method IN ('cheque','slip')").get(businessId, sourcePaymentId);
    const alreadyUsed = db.prepare("SELECT id FROM party_payments WHERE business_id=? AND source_payment_id=?").get(businessId, sourcePaymentId);
    if (!source || alreadyUsed) throw Object.assign(new Error("Selected cheque/slip is no longer pending"), { statusCode: 400 });
    if (normalizedMethod !== source.method) throw Object.assign(new Error("Selected payment instrument method does not match"), { statusCode: 400 });
  }
  if (chequeType === "self") {
    const selfAccount = db.prepare("SELECT * FROM bank_accounts WHERE business_id=? AND id=? AND category='self' AND is_active=1").get(businessId, chequeAccountId);
    if (!selfAccount || !chequeNo) throw Object.assign(new Error("Self cheque account and cheque number are required"), { statusCode: 400 });
    const used = db.prepare("SELECT id FROM party_payments WHERE business_id=? AND cheque_type='self' AND cheque_account_id=? AND cheque_no=?").get(businessId, chequeAccountId, chequeNo);
    if (used) throw Object.assign(new Error("This self cheque has already been issued"), { statusCode: 409 });
  }
  const ts = new Date().toISOString();
  const paymentDate = text(payload.payment_date) || ts.slice(0, 10);
  const result = insertPartyPayment([
    businessId,
    partyType(kind),
    existing.id,
    userId,
    paymentDate,
    normalizedMethod,
    amount,
    chequeType === "self" ? chequeNo : normalizedMethod === "cash" ? "" : text(payload.reference_no),
    normalizedMethod === "cheque" ? text(payload.bank_name) : "",
    normalizedMethod === "cheque" ? text(payload.cheque_date) : "",
    normalizedMethod === "slip" ? text(payload.slip_date) : "",
    text(payload.notes),
    bankAccountId,
    clearingDate,
    chequeType,
    chequeNo,
    chequeAccountId,
    sourcePaymentId,
    ts,
    ts,
  ]);
  return { payment: getPartyPayment(businessId, result.lastInsertRowid), party: toDto(kind, existing, getPartyBalance(kind, businessId, existing.id)) };
};

export const updatePartyPayment = (businessId, userId, id, payload = {}) => {
  const existingPayment = getPartyPayment(businessId, id);
  if (!existingPayment) throw Object.assign(new Error("Payment not found"), { statusCode: 404 });
  const targetKind = text(payload.party_type) === "supplier" ? "suppliers" : "customers";
  const targetParty = getParty(targetKind, businessId, text(payload.party_id) || existingPayment.party_id);
  if (!targetParty) throw Object.assign(new Error("Selected party not found"), { statusCode: 404 });
  const method = text(payload.method).toLowerCase();
  const chequeType = method === "self_cheque" ? "self" : text(payload.cheque_type);
  const normalizedMethod = method === "self_cheque" ? "cheque" : method;
  const amount = num(payload.amount);
  if (!methods.has(normalizedMethod)) throw Object.assign(new Error("Invalid payment method"), { statusCode: 400 });
  if (amount <= 0) throw Object.assign(new Error("Payment amount must be greater than zero"), { statusCode: 400 });
  if (chequeType === "self" && targetKind !== "suppliers") throw Object.assign(new Error("Self cheque can only be issued to a supplier"), { statusCode: 400 });
  const bankAccountId = text(payload.bank_account_id);
  const sourcePaymentId = text(payload.source_payment_id);
  const chequeNo = text(payload.cheque_no);
  const chequeAccountId = text(payload.cheque_account_id);
  const clearingDate = normalizedMethod === "cheque" || normalizedMethod === "slip" ? text(payload.clearing_date) : "";
  if (normalizedMethod === "online" && !bankAccountId) throw Object.assign(new Error("Online payment account is required"), { statusCode: 400 });
  if (bankAccountId) {
    const account = db.prepare("SELECT * FROM bank_accounts WHERE business_id=? AND id=? AND is_active=1").get(businessId, bankAccountId);
    const allowedCategories = targetKind === "suppliers" && normalizedMethod === "online" ? ["customer", "self"] : ["supplier", "self"];
    if (!account || !allowedCategories.includes(account.category)) throw Object.assign(new Error("Invalid payment account"), { statusCode: 400 });
  }
  if (sourcePaymentId) {
    if (targetKind !== "suppliers") throw Object.assign(new Error("Pending customer instruments can only be used for supplier payments"), { statusCode: 400 });
    const source = db.prepare("SELECT * FROM party_payments WHERE business_id=? AND id=? AND party_type='customer' AND method IN ('cheque','slip')").get(businessId, sourcePaymentId);
    const alreadyUsed = db.prepare("SELECT id FROM party_payments WHERE business_id=? AND source_payment_id=? AND id<>?").get(businessId, sourcePaymentId, id);
    if (!source || alreadyUsed) throw Object.assign(new Error("Selected cheque/slip is no longer pending"), { statusCode: 400 });
    if (normalizedMethod !== source.method) throw Object.assign(new Error("Selected payment instrument method does not match"), { statusCode: 400 });
  }
  if (chequeType === "self") {
    const selfAccount = db.prepare("SELECT * FROM bank_accounts WHERE business_id=? AND id=? AND category='self' AND is_active=1").get(businessId, chequeAccountId);
    const used = db.prepare("SELECT id FROM party_payments WHERE business_id=? AND cheque_type='self' AND cheque_account_id=? AND cheque_no=? AND id<>?").get(businessId, chequeAccountId, chequeNo, id);
    if (!selfAccount || !chequeNo) throw Object.assign(new Error("Self cheque account and cheque number are required"), { statusCode: 400 });
    if (used) throw Object.assign(new Error("This self cheque has already been issued"), { statusCode: 409 });
  }
  const ts = new Date().toISOString();
  persistPartyPayment(businessId, id, [
    targetKind === "suppliers" ? "supplier" : "customer",
    targetParty.id,
    text(payload.payment_date) || existingPayment.payment_date,
    normalizedMethod,
    amount,
    chequeType === "self" ? chequeNo : normalizedMethod === "cash" ? "" : text(payload.reference_no),
    normalizedMethod === "cheque" ? text(payload.bank_name) : "",
    normalizedMethod === "cheque" ? text(payload.cheque_date) : "",
    normalizedMethod === "slip" ? text(payload.slip_date) : "",
    text(payload.notes),
    bankAccountId,
    clearingDate,
    chequeType,
    chequeNo,
    chequeAccountId,
    sourcePaymentId,
    ts,
  ]);
  return { payment: getPartyPayment(businessId, id) };
};

export const deletePartyPayment = (businessId, id) => {
  const payment = getPartyPayment(businessId, id);
  if (!payment) throw Object.assign(new Error("Payment not found"), { statusCode: 404 });
  const linked = db.prepare("SELECT id FROM party_payments WHERE business_id=? AND source_payment_id=? AND id<>?").get(businessId, String(id), id);
  if (linked) throw Object.assign(new Error("This payment is already assigned to a supplier payment. Delete the linked supplier payment first."), { statusCode: 409 });
  removePartyPayment(businessId, id);
  return { id: String(id) };
};

export const listPaymentDtos = (businessId, filters = {}) => listPayments(businessId, filters).map((row) => ({
  id: `${row.source}-${row.id}`,
  payment_id: row.source === "party" ? String(row.id) : "",
  source: row.source,
  party_type: row.party_type,
  party_id: row.party_id || "",
  party_name: row.party_name || "",
  payment_date: row.payment_date || "",
  method: row.cheque_type === "self" ? "self_cheque" : row.method || "",
  amount: Number(row.amount || 0),
  reference_no: row.reference_no || row.cheque_no || "",
  bank_name: row.bank_name || "",
  cheque_date: row.cheque_date || "",
  slip_date: row.slip_date || "",
  clearing_date: row.clearing_date || "",
  cheque_type: row.cheque_type || "",
  cheque_no: row.cheque_no || "",
  cheque_account_id: row.cheque_account_id || "",
  source_payment_id: row.source_payment_id || "",
  bank_account_id: row.bank_account_id || "",
  destination_category: row.destination_category || "",
  destination_party_id: row.destination_party_id || "",
  destination_account_title: row.destination_account_title || "",
  destination_bank_name: row.destination_bank_name || "",
  cheque_account_title: row.cheque_account_title || "",
  cheque_account_bank: row.cheque_account_bank || "",
  notes: row.notes || "",
}));
