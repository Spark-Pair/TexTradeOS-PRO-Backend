import { db } from "../../db/connection.js";
import { getBankAccount } from "../bank-accounts/bank-account.model.js";
import { getParty } from "../parties/party.model.js";
import { getBalanceEntry, hasOpeningBalanceEntry, insertBalanceEntry, listBalanceEntries } from "./balance-entry.model.js";

const text = (value) => String(value ?? "").trim();
const entityTypes = new Set(["customer", "supplier", "bank_account"]);
const entryTypes = new Set(["opening", "adjustment"]);
const directions = new Set(["debit", "credit"]);
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const dto = (row) => row && ({
  _id: String(row.id),
  entity_type: row.entity_type,
  entity_id: row.entity_id,
  entity_name: row.entity_name || "Deleted account",
  bank_name: row.bank_name || "",
  entry_type: row.entry_type,
  entry_date: row.entry_date,
  direction: row.direction,
  amount: Number(row.amount || 0),
  reference: row.reference || "",
  description: row.description || "",
  notes: row.notes || "",
  created_by_name: row.created_by_name || "",
  created_at: row.created_at,
});

const getEntity = (businessId, type, id) => {
  if (type === "bank_account") return getBankAccount(businessId, id);
  return getParty(type === "customer" ? "customers" : "suppliers", businessId, id);
};

export const listBalanceEntryDtos = (businessId) => listBalanceEntries(businessId).map(dto);

export const createBalanceEntry = (businessId, userId, payload = {}) => {
  const entityType = text(payload.entity_type).toLowerCase();
  const entityId = text(payload.entity_id);
  const entryType = text(payload.entry_type).toLowerCase();
  const entryDate = text(payload.entry_date).slice(0, 10);
  const direction = text(payload.direction).toLowerCase();
  const amount = Number(String(payload.amount ?? "").replace(/,/g, ""));
  const reference = text(payload.reference);
  const notes = text(payload.notes);

  if (!entityTypes.has(entityType)) throw fail(400, "Select a customer, supplier, or bank account");
  if (!entityId || !getEntity(businessId, entityType, entityId)) throw fail(400, "Selected account was not found");
  if (!entryTypes.has(entryType)) throw fail(400, "Select an entry type");
  const parsedDate = new Date(`${entryDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== entryDate) throw fail(400, "Enter a valid entry date");
  if (!directions.has(direction)) throw fail(400, "Select debit or credit");
  if (!Number.isFinite(amount) || amount <= 0) throw fail(400, "Amount must be greater than zero");
  if (entryType === "opening" && hasOpeningBalanceEntry(businessId, entityType, entityId)) {
    throw fail(409, "An opening balance has already been entered for this account");
  }

  const timestamp = new Date().toISOString();
  try {
    const row = db.transaction(() => insertBalanceEntry({
      business_id: businessId,
      created_by: userId,
      entity_type: entityType,
      entity_id: entityId,
      entry_type: entryType,
      entry_date: entryDate,
      direction,
      amount,
      reference,
      description: text(payload.description) || (entryType === "opening" ? "Opening Balance" : "Balance Adjustment"),
      notes,
      created_at: timestamp,
      updated_at: timestamp,
    })).immediate();
    return dto(row);
  } catch (error) {
    if (String(error.message).includes("idx_balance_entries_single_opening") || String(error.message).includes("UNIQUE constraint failed: balance_entries")) {
      throw fail(409, "An opening balance has already been entered for this account");
    }
    throw error;
  }
};
